import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * ConfidentialPayroll Task Reference
 * ====================================
 *
 * All commands run against the deployed contract on Sepolia.
 *
 * 1. List registered employees:
 *    npx hardhat --network sepolia payroll:employees
 *
 * 2. Register an employee (employer wallet = signers[0] from your MNEMONIC):
 *    npx hardhat --network sepolia payroll:add-employee --address 0xEMPLOYEE_ADDRESS
 *
 * 3. Run payroll for one employee:
 *    npx hardhat --network sepolia payroll:run --employee 0xADDR --amount 5000
 *
 * 4. Run payroll for multiple employees (comma-separated, no spaces):
 *    npx hardhat --network sepolia payroll:run-batch \
 *      --employees 0xALICE,0xBOB \
 *      --amounts 5000,7000
 *
 * 5. Decrypt your own balance (must be called as the employee — use signer index):
 *    npx hardhat --network sepolia payroll:my-balance --signer 1
 *    (signer 0 = employer/deployer, signer 1 = first account from mnemonic, etc.)
 *
 * 6. Withdraw/zero your balance:
 *    npx hardhat --network sepolia payroll:withdraw --signer 1
 *
 * NOTE: For decryption to work on Sepolia, the signer must be the address
 * that was granted FHE.allow() for that balance (i.e. the registered employee).
 * Import each test wallet into MetaMask using its private key, derived from
 * the same mnemonic (path m/44'/60'/0'/0/N where N is the signer index).
 */

const CONTRACT_ADDRESS = "0xB482f89B468a9E9Ea8AFA38C09e83d0430D93De2";

// ─────────────────────────────────────────────────────────────────────────────
// payroll:employees — list all registered employees
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:employees", "Lists all registered employees in the ConfidentialPayroll contract").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { ethers } = hre;

    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS);
    const employees: string[] = await payroll.getEmployees();

    if (employees.length === 0) {
      console.log("No employees registered yet.");
      return;
    }

    console.log(`\n${"─".repeat(50)}`);
    console.log(`ConfidentialPayroll: ${CONTRACT_ADDRESS}`);
    console.log(`Registered employees (${employees.length}):`);
    employees.forEach((addr, i) => console.log(`  [${i}] ${addr}`));
    console.log(`${"─".repeat(50)}\n`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// payroll:add-employee — register a single employee address
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:add-employee", "Registers an employee address (called by employer/deployer)")
  .addParam("address", "The employee wallet address to register")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;

    const signers = await ethers.getSigners();
    const employer = signers[0];
    console.log(`Employer (caller): ${employer.address}`);

    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS, employer);
    const employeeAddr: string = taskArguments.address;

    // Check if already registered to give a clear message
    const alreadyEmployee: boolean = await payroll.isEmployee(employeeAddr);
    if (alreadyEmployee) {
      console.log(`⚠  ${employeeAddr} is already a registered employee.`);
      return;
    }

    console.log(`Registering employee: ${employeeAddr} ...`);
    const tx = await payroll.addEmployee(employeeAddr);
    console.log(`  Tx sent: ${tx.hash}`);
    console.log(`  Waiting for confirmation...`);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt?.blockNumber} (status=${receipt?.status})`);
    console.log(`  Employee ${employeeAddr} registered successfully.`);
  });

// ─────────────────────────────────────────────────────────────────────────────
// payroll:run — run payroll for a single employee
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:run", "Encrypts a salary amount and pays a single employee")
  .addParam("employee", "The employee wallet address")
  .addParam("amount", "The salary amount in units (plaintext — encrypted in this script before sending)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    const amount = parseInt(taskArguments.amount);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`--amount must be a non-negative integer`);
    }

    console.log(`\nInitializing FHEVM CLI API (connects to Zama KMS relayer)...`);
    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const employer = signers[0];
    console.log(`Employer  : ${employer.address}`);
    console.log(`Employee  : ${taskArguments.employee}`);
    console.log(`Amount    : ${amount} units (will be encrypted before sending)`);

    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS, employer);

    console.log(`\nStep 1/3: Encrypting amount ${amount} with ZK proof...`);
    const encryptedInput = await fhevm.createEncryptedInput(CONTRACT_ADDRESS, employer.address).add32(amount).encrypt();

    console.log(`  Handle: ${encryptedInput.handles[0]}`);
    console.log(`  Proof : ${encryptedInput.inputProof.slice(0, 20)}... (truncated)`);

    console.log(`\nStep 2/3: Broadcasting runPayroll transaction...`);
    const tx = await payroll.runPayroll(
      [taskArguments.employee],
      [encryptedInput.handles[0]],
      [encryptedInput.inputProof],
    );
    console.log(`  Tx sent: ${tx.hash}`);

    console.log(`\nStep 3/3: Waiting for block confirmation...`);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt?.blockNumber} (status=${receipt?.status})`);
    console.log(`\n✓ Payroll complete. ${taskArguments.employee} has been paid ${amount} units (encrypted on-chain).`);
    console.log(`  The employer (${employer.address}) cannot decrypt this amount — only the employee can.`);
  });

// ─────────────────────────────────────────────────────────────────────────────
// payroll:run-batch — run payroll for multiple employees in one transaction
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:run-batch", "Encrypts and pays multiple employees in a single transaction")
  .addParam("employees", "Comma-separated employee addresses (no spaces)")
  .addParam("amounts", "Comma-separated amounts matching the employees order (no spaces)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    const employeeAddrs: string[] = taskArguments.employees.split(",");
    const amounts: number[] = taskArguments.amounts.split(",").map((a: string) => parseInt(a));

    if (employeeAddrs.length !== amounts.length) {
      throw new Error(`--employees and --amounts must have the same number of entries`);
    }
    if (amounts.some((a: number) => !Number.isInteger(a) || a < 0)) {
      throw new Error(`All amounts must be non-negative integers`);
    }

    console.log(`\nInitializing FHEVM CLI API...`);
    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const employer = signers[0];
    console.log(`Employer: ${employer.address}`);
    console.log(`\nPayroll batch (${employeeAddrs.length} employees):`);
    employeeAddrs.forEach((addr, i) => console.log(`  ${addr}  →  ${amounts[i]} units`));

    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS, employer);

    console.log(`\nStep 1/3: Encrypting ${employeeAddrs.length} salary amounts...`);
    const allHandles: Uint8Array[] = [];
    const allProofs: Uint8Array[] = [];

    for (let i = 0; i < employeeAddrs.length; i++) {
      const enc = await fhevm.createEncryptedInput(CONTRACT_ADDRESS, employer.address).add32(amounts[i]).encrypt();
      allHandles.push(enc.handles[0]);
      allProofs.push(enc.inputProof);
      console.log(`  [${i}] ${employeeAddrs[i]}: encrypted ✓`);
    }

    console.log(`\nStep 2/3: Broadcasting batch runPayroll transaction...`);
    const tx = await payroll.runPayroll(employeeAddrs, allHandles, allProofs);
    console.log(`  Tx sent: ${tx.hash}`);

    console.log(`\nStep 3/3: Waiting for block confirmation...`);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt?.blockNumber} (status=${receipt?.status})`);

    console.log(`\n✓ Batch payroll complete!`);
    employeeAddrs.forEach((addr, i) =>
      console.log(`  ${addr}  →  ${amounts[i]} units (encrypted, only employee can decrypt)`),
    );
  });

// ─────────────────────────────────────────────────────────────────────────────
// payroll:my-balance — decrypt the calling employee's own balance
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:my-balance", "Decrypts and displays the employee's own salary balance")
  .addOptionalParam("signer", "Signer index from your mnemonic (0=employer, 1=first employee, etc.)", "1")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    const signerIndex = parseInt(taskArguments.signer);

    console.log(`\nInitializing FHEVM CLI API...`);
    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    if (signerIndex >= signers.length) {
      throw new Error(`Signer index ${signerIndex} out of range (0–${signers.length - 1})`);
    }

    const employee = signers[signerIndex];
    console.log(`Employee  : ${employee.address} (signer[${signerIndex}])`);
    console.log(`Contract  : ${CONTRACT_ADDRESS}`);

    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS, employee);

    const isRegistered: boolean = await payroll.isEmployee(employee.address);
    if (!isRegistered) {
      console.log(`\n⚠  ${employee.address} is not a registered employee.`);
      console.log(
        `   Ask the employer to run: npx hardhat --network sepolia payroll:add-employee --address ${employee.address}`,
      );
      return;
    }

    console.log(`\nFetching encrypted balance handle from contract...`);
    const encryptedBalance = await payroll.getMyBalance();

    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`  Encrypted handle: ${encryptedBalance} (zero — no payroll run yet)`);
      console.log(`  Clear balance   : 0`);
      return;
    }

    console.log(`  Encrypted handle: ${encryptedBalance}`);
    console.log(`\nRequesting decryption from Zama KMS relayer...`);
    console.log(`(Only this employee's signature can authorize this decryption)`);

    const clearBalance = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedBalance, CONTRACT_ADDRESS, employee);

    console.log(`\n${"═".repeat(50)}`);
    console.log(`  Employee  : ${employee.address}`);
    console.log(`  Balance   : ${clearBalance} units`);
    console.log(`${"═".repeat(50)}`);
    console.log(`\n✓ Decryption authorized by employee wallet signature.`);
    console.log(`  No other address (including the employer) can see this value.`);
  });

// ─────────────────────────────────────────────────────────────────────────────
// payroll:withdraw — zero the calling employee's balance (simulate payout)
// ─────────────────────────────────────────────────────────────────────────────
task("payroll:withdraw", "Zeros the employee's on-chain balance (simulates a payout claim)")
  .addOptionalParam("signer", "Signer index from your mnemonic (0=employer, 1=first employee, etc.)", "1")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;

    const signerIndex = parseInt(taskArguments.signer);
    const signers = await ethers.getSigners();
    const employee = signers[signerIndex];

    console.log(`Employee (caller): ${employee.address}`);
    const payroll = await ethers.getContractAt("ConfidentialPayroll", CONTRACT_ADDRESS, employee);

    console.log(`Broadcasting withdraw()...`);
    const tx = await payroll.withdraw();
    console.log(`  Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt?.blockNumber}`);
    console.log(`\n✓ Balance zeroed. Run payroll:my-balance to confirm it's now 0.`);
  });
