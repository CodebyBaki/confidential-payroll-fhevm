import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialPayroll, ConfidentialPayroll__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  employer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ConfidentialPayroll")) as ConfidentialPayroll__factory;
  const payroll = (await factory.deploy()) as ConfidentialPayroll;
  const payrollAddress = await payroll.getAddress();
  return { payroll, payrollAddress };
}

describe("ConfidentialPayroll", function () {
  let signers: Signers;
  let payroll: ConfidentialPayroll;
  let payrollAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { employer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    ({ payroll, payrollAddress } = await deployFixture());
  });

  it("registers employees", async function () {
    await (await payroll.connect(signers.employer).addEmployee(signers.alice.address)).wait();
    await (await payroll.connect(signers.employer).addEmployee(signers.bob.address)).wait();

    expect(await payroll.isEmployee(signers.alice.address)).to.eq(true);
    expect(await payroll.isEmployee(signers.bob.address)).to.eq(true);

    const employees = await payroll.getEmployees();
    expect(employees).to.deep.eq([signers.alice.address, signers.bob.address]);
  });

  it("rejects addEmployee from a non-employer caller", async function () {
    await expect(payroll.connect(signers.alice).addEmployee(signers.bob.address)).to.be.revertedWithCustomError(
      payroll,
      "NotEmployer",
    );
  });

  it("pays two employees different confidential amounts in one batch, and each can only decrypt their own", async function () {
    await (await payroll.connect(signers.employer).addEmployee(signers.alice.address)).wait();
    await (await payroll.connect(signers.employer).addEmployee(signers.bob.address)).wait();

    const aliceSalary = 5000; // e.g. cents, or smallest unit of your confidential token
    const bobSalary = 7500;

    // Employer encrypts both salaries off-chain, each bound to this contract + employer as sender.
    const encryptedAlice = await fhevm
      .createEncryptedInput(payrollAddress, signers.employer.address)
      .add32(aliceSalary)
      .encrypt();
    const encryptedBob = await fhevm
      .createEncryptedInput(payrollAddress, signers.employer.address)
      .add32(bobSalary)
      .encrypt();

    const tx = await payroll
      .connect(signers.employer)
      .runPayroll(
        [signers.alice.address, signers.bob.address],
        [encryptedAlice.handles[0], encryptedBob.handles[0]],
        [encryptedAlice.inputProof, encryptedBob.inputProof],
      );
    await tx.wait();

    // Alice decrypts her own balance -> should equal her salary.
    const aliceHandle = await payroll.connect(signers.alice).getMyBalance();
    const aliceClear = await fhevm.userDecryptEuint(FhevmType.euint32, aliceHandle, payrollAddress, signers.alice);
    expect(aliceClear).to.eq(aliceSalary);

    // Bob decrypts his own balance -> should equal his salary, not Alice's.
    const bobHandle = await payroll.connect(signers.bob).getMyBalance();
    const bobClear = await fhevm.userDecryptEuint(FhevmType.euint32, bobHandle, payrollAddress, signers.bob);
    expect(bobClear).to.eq(bobSalary);

    // Critically: Bob was never granted access to Alice's ciphertext, so attempting to
    // user-decrypt Alice's handle as Bob must fail. This is the privacy guarantee.
    await expect(fhevm.userDecryptEuint(FhevmType.euint32, aliceHandle, payrollAddress, signers.bob)).to.be.rejected;
  });

  it("accumulates balance across two payroll runs", async function () {
    await (await payroll.connect(signers.employer).addEmployee(signers.alice.address)).wait();

    const first = 1000;
    const second = 2000;

    const enc1 = await fhevm.createEncryptedInput(payrollAddress, signers.employer.address).add32(first).encrypt();
    await (
      await payroll.connect(signers.employer).runPayroll([signers.alice.address], [enc1.handles[0]], [enc1.inputProof])
    ).wait();

    const enc2 = await fhevm.createEncryptedInput(payrollAddress, signers.employer.address).add32(second).encrypt();
    await (
      await payroll.connect(signers.employer).runPayroll([signers.alice.address], [enc2.handles[0]], [enc2.inputProof])
    ).wait();

    const handle = await payroll.connect(signers.alice).getMyBalance();
    const clear = await fhevm.userDecryptEuint(FhevmType.euint32, handle, payrollAddress, signers.alice);
    expect(clear).to.eq(first + second);
  });

  it("lets an employee withdraw, zeroing their balance", async function () {
    await (await payroll.connect(signers.employer).addEmployee(signers.alice.address)).wait();

    const salary = 3000;
    const enc = await fhevm.createEncryptedInput(payrollAddress, signers.employer.address).add32(salary).encrypt();
    await (
      await payroll.connect(signers.employer).runPayroll([signers.alice.address], [enc.handles[0]], [enc.inputProof])
    ).wait();

    await (await payroll.connect(signers.alice).withdraw()).wait();

    const handle = await payroll.connect(signers.alice).getMyBalance();
    const clear = await fhevm.userDecryptEuint(FhevmType.euint32, handle, payrollAddress, signers.alice);
    expect(clear).to.eq(0);
  });

  it("rejects runPayroll with mismatched array lengths", async function () {
    await (await payroll.connect(signers.employer).addEmployee(signers.alice.address)).wait();

    const enc = await fhevm.createEncryptedInput(payrollAddress, signers.employer.address).add32(100).encrypt();

    await expect(
      payroll.connect(signers.employer).runPayroll([signers.alice.address], [enc.handles[0]], []),
    ).to.be.revertedWithCustomError(payroll, "ArrayLengthMismatch");
  });
});
