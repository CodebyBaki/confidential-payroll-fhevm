# ConfidentialPayroll — Zama FHEVM Builder Track

> **Zama Developer Program Mainnet Season 3 — Builder Track submission**

A confidential payroll dApp built on Zama's FHEVM. An employer runs payroll for a batch of employees in a single transaction. Every salary amount stays **encrypted on-chain** — employees can decrypt only their own balance, and the employer who set the amounts can never read them back.

## Live Deployment (Sepolia)

| | |
|---|---|
| **Contract** | [`0xB482f89B468a9E9Ea8AFA38C09e83d0430D93De2`](https://sepolia.etherscan.io/address/0xB482f89B468a9E9Ea8AFA38C09e83d0430D93De2) |
| **Network** | Ethereum Sepolia Testnet |
| **Deployer** | `0xe769489403ecdda0e2da0184723e8b80ec88c364` |

## What it does

One employer, N employees. The employer calls `runPayroll(employees[], encryptedAmounts[], proofs[])` — a single transaction that updates each employee's encrypted balance using FHE addition. No plaintext salary value ever appears on-chain or in the transaction data.

After payroll runs:
- **Employee A** connects their wallet, requests decryption via the Zama KMS relayer, signs an EIP-712 message — sees their own balance.
- **Employee B** does the same — sees only their own balance, a different number.
- **Anyone else** (including the employer, block explorers, other employees) attempting to decrypt Employee A's ciphertext handle gets rejected by the KMS relayer — because `FHE.allow()` was never granted to them.

This is enforced cryptographically at the KMS layer, not just in the UI.

## Key design decisions

**Asymmetric ACL** — the employer encrypts each salary amount and submits it, but is never granted `FHE.allow` on the resulting ciphertext. The employer is write-only: they can pay employees but can never see individual salaries. This is a stronger privacy property than most FHEVM examples, where the encrypting address can usually decrypt back.

**Batch payroll in one transaction** — `runPayroll` loops over N employees and applies `FHE.add` to each encrypted balance independently, with correct `FHE.allowThis` + `FHE.allow(newBalance, employee)` after every write. This demonstrates composable encrypted state across multiple ciphertexts, not just a single counter.

**Accumulating state** — balances accumulate across multiple payroll runs, proving FHE arithmetic composes correctly over time.

## Contract interface

| Function | Caller | Description |
|---|---|---|
| `addEmployee(address)` | employer | Register employee, initialize encrypted balance to 0 |
| `runPayroll(address[], externalEuint32[], bytes[])` | employer | Batch-pay employees with encrypted amounts |
| `getMyBalance()` | registered employee | Returns own encrypted balance handle |
| `getBalanceHandle(address)` | anyone | Returns handle (not decryptable by non-authorized callers) |
| `withdraw()` | registered employee | Zeros balance, simulating a payout claim |
| `getEmployees()` | anyone | List all registered employee addresses |

## Test suite

6 tests, all passing against the FHEVM local mock:

```
✔ registers employees
✔ rejects addEmployee from a non-employer caller
✔ pays two employees different confidential amounts in one batch, and each can only decrypt their own
✔ accumulates balance across two payroll runs
✔ lets an employee withdraw, zeroing their balance
✔ rejects runPayroll with mismatched array lengths
```

The third test is the critical one: it explicitly proves that Bob's wallet cannot decrypt Alice's ciphertext handle — the SDK call rejects, confirming ACL enforcement works end-to-end.

## Running locally

```bash
npm install
npm run compile
npm test
```

## Hardhat tasks (Sepolia)

```bash
# List registered employees
npx hardhat --network sepolia payroll:employees

# Register an employee (as employer)
npx hardhat --network sepolia payroll:add-employee --address 0xEMPLOYEE

# Pay one employee (encrypts in CLI, submits to chain)
npx hardhat --network sepolia payroll:run --employee 0xADDR --amount 5000

# Pay multiple employees in one transaction
npx hardhat --network sepolia payroll:run-batch \
  --employees 0xALICE,0xBOB \
  --amounts 5000,7000

# Decrypt your own balance (as employee, signer index from mnemonic)
npx hardhat --network sepolia payroll:my-balance --signer 1

# Withdraw / zero your balance
npx hardhat --network sepolia payroll:withdraw --signer 1
```

## Frontend

Single-file `index.html` — no build step. Serve with:

```bash
npx serve .
# open http://localhost:3000
```

MetaMask required, set to Sepolia. The frontend uses the `@zama-fhe/relayer-sdk` for browser-side encryption and EIP-712 user decryption.

## Project structure

```
contracts/
  ConfidentialPayroll.sol   ← main contract
  FHECounter.sol            ← template example (unchanged)
deploy/
  deployPayroll.ts          ← deployment script
tasks/
  ConfidentialPayroll.ts    ← all payroll Hardhat tasks
  FHECounter.ts             ← template tasks (unchanged)
test/
  ConfidentialPayroll.ts    ← 6 tests
  FHECounter.ts             ← template tests (unchanged)
index.html                  ← frontend (no build step)
PAYROLL_README.md           ← extended notes and design rationale
```

## Built with

- [Zama FHEVM](https://github.com/zama-ai/fhevm) — FHE smart contract framework
- [Hardhat](https://hardhat.org) + `@fhevm/hardhat-plugin`
- ethers v6
- Solidity 0.8.24



# FHEVM Hardhat Template

A Hardhat-based template for developing Fully Homomorphic Encryption (FHE) enabled Solidity smart contracts using the
FHEVM protocol by Zama.

## Quick Start

For detailed instructions see:
[FHEVM Hardhat Quick Start Tutorial](https://docs.zama.ai/protocol/solidity-guides/getting-started/quick-start-tutorial)

### Prerequisites

- **Node.js**: Version 20 or higher
- **npm or yarn/pnpm**: Package manager

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   ```bash
   npx hardhat vars set MNEMONIC

   # Set your Infura API key for network access
   npx hardhat vars set INFURA_API_KEY

   # Optional: Set Etherscan API key for contract verification
   npx hardhat vars set ETHERSCAN_API_KEY
   ```

3. **Compile and test**

   ```bash
   npm run compile
   npm run test
   ```

4. **Deploy to local network**

   ```bash
   # Start a local FHEVM-ready node
   npx hardhat node
   # Deploy to local network
   npx hardhat deploy --network localhost
   ```

5. **Deploy to Sepolia Testnet**

   ```bash
   # Deploy to Sepolia
   npx hardhat deploy --network sepolia
   # Verify contract on Etherscan
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

6. **Test on Sepolia Testnet**

   ```bash
   # Once deployed, you can run a simple test on Sepolia.
   npx hardhat test --network sepolia
   ```

## 📁 Project Structure

```
fhevm-hardhat-template/
├── contracts/           # Smart contract source files
│   └── FHECounter.sol   # Example FHE counter contract
├── deploy/              # Deployment scripts
├── tasks/               # Hardhat custom tasks
├── test/                # Test files
├── hardhat.config.ts    # Hardhat configuration
└── package.json         # Dependencies and scripts
```

## 📜 Available Scripts

| Script             | Description              |
| ------------------ | ------------------------ |
| `npm run compile`  | Compile all contracts    |
| `npm run test`     | Run all tests            |
| `npm run coverage` | Generate coverage report |
| `npm run lint`     | Run linting checks       |
| `npm run clean`    | Clean build artifacts    |

## 📚 Documentation

- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [FHEVM Hardhat Setup Guide](https://docs.zama.ai/protocol/solidity-guides/getting-started/setup)
- [FHEVM Testing Guide](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/write_test)
- [FHEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)

## 📄 License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/zama-ai/fhevm/issues)
- **Documentation**: [FHEVM Docs](https://docs.zama.ai)
- **Community**: [Zama Discord](https://discord.gg/zama)

---

**Built with ❤️ by the Zama team**
