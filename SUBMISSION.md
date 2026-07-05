# Zama Developer Program Season 3 — Submission Form Text

## Project Name

ConfidentialPayroll

---

## Track

Builder Track

---

## One-line description

A confidential payroll dApp where employers run batch salary payments using FHE — every amount stays encrypted on-chain
and only each employee can decrypt their own balance, enforced by the Zama KMS, not just the UI.

---

## Contract Address (Sepolia)

0xB482f89B468a9E9Ea8AFA38C09e83d0430D93De2

---

## GitHub Repository

https://github.com/CodebyBaki/confidential-payroll-fhevm

---

## Demo Video

[VIDEO_URL]

---

## Project Description (long form)

ConfidentialPayroll demonstrates a real-world use of FHEVM for payroll processing on a public blockchain.

**The core problem it solves:** On a public EVM chain, all contract state is visible to anyone. A traditional on-chain
payroll system would expose every employee's salary to every other employee, to the employer, and to any block explorer.
FHE makes confidential payroll possible without a trusted intermediary or a private chain.

**How it works:**

The employer calls `runPayroll(employees[], encryptedAmounts[], proofs[])` — a single transaction that accepts one
ZK-proven encrypted salary amount per employee and applies FHE addition to each employee's running balance. No plaintext
salary value appears anywhere in the transaction data or contract storage.

After payroll runs, each employee calls `getMyBalance()` to retrieve their ciphertext handle, then requests decryption
via the Zama KMS relayer using an EIP-712 signature. The KMS checks the on-chain ACL — if
`FHE.allow(balance, employeeAddress)` was set for that employee, decryption is authorized and the cleartext balance is
returned only to that wallet. Anyone else attempting to decrypt the same handle is rejected by the KMS.

**The key privacy property — asymmetric ACL:**

Most introductory FHEVM examples grant decrypt permission to the same address that performed the encryption.
ConfidentialPayroll deliberately does not: the employer encrypts each salary amount and submits it to the contract, but
is never granted `FHE.allow` on the resulting ciphertext. The employer is write-only — they can pay employees but can
never read individual salaries back. This is a stronger and more realistic privacy model for corporate payroll, where
the payroll administrator should not have ongoing read access to individual compensation data.

**What is demonstrated:**

1. Batch FHE operations — `runPayroll` loops over N employees in one transaction, running `FHE.add` on each employee's
   independent ciphertext with correct ACL management after every write.
2. Asymmetric ACL — writer cannot read; only the designated recipient can decrypt.
3. Accumulating encrypted state — balances accumulate correctly across multiple payroll runs.
4. Live KMS rejection — the frontend includes a Privacy Verification panel where a user can attempt to decrypt another
   employee's balance handle. The Zama KMS rejects the request and the UI surfaces the rejection message, proving the
   privacy guarantee is enforced at the cryptographic layer, not just in application code.

**Test coverage:**

6 tests run against the FHEVM local mock, including one that explicitly attempts to call `userDecryptEuint` on Alice's
handle using Bob's signer — the SDK rejects the call, confirming ACL enforcement works end-to-end before any Sepolia
deployment.

**Background:**

This project was built by a Card Payment Switching Engineer at a commercial bank, bringing domain knowledge of real
payroll and transaction processing systems to the FHEVM ecosystem. Confidential payroll is one of Zama's own flagship
use cases — this submission is an attempt to build toward that vision with a working, tested implementation rather than
a prototype counter or voting contract.

---

## Technical Stack

- Zama FHEVM (`@fhevm/solidity`, `@fhevm/hardhat-plugin`)
- Hardhat + TypeScript
- Solidity 0.8.24
- ethers v6
- @zama-fhe/relayer-sdk (browser)
- Deployed on Ethereum Sepolia

---

## Challenges and what I learned

The most technically interesting challenge was getting the ACL model right for the batch case. In a single-ciphertext
contract, you call `FHE.allowThis` and `FHE.allow` once. In `runPayroll`, you are creating a new ciphertext on every
loop iteration (because `FHE.add` returns a new handle, it does not mutate in place) — so you must call both allow
functions after every iteration, not just at the end. Missing this would mean the contract loses the ability to operate
on the ciphertext in the next payroll run.

The second challenge was understanding that `FHE.allow` takes the _new_ handle returned by `FHE.add`, not the original
handle passed in. Getting this right was the difference between tests passing and the accumulation test failing.

On the tooling side, the browser-side FHEVM SDK (`@zama-fhe/relayer-sdk`) is still evolving rapidly — the
`createInstance` API and the contract addresses on Sepolia required careful verification against the live `.env.testnet`
file in the relayer-sdk repo rather than relying on documentation, which lagged behind the deployed infrastructure.
