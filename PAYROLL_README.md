# ConfidentialPayroll — Zama FHEVM Builder Track Submission

A confidential payroll dApp built on Zama's FHEVM. An employer runs payroll for a batch of employees in a single
transaction — every salary amount stays **encrypted on-chain**. Each employee can decrypt only their _own_ balance. The
employer who set the amounts can never decrypt them back. No one — not co-workers, not block explorers, not the employer
— can see anyone else's pay.

## Why this idea

Confidential payroll is one of the flagship real-world use cases Zama itself points to for FHE on public blockchains
(alongside corporate payments and RWA tokenization) — but most hackathon submissions default to confidential-transfer or
confidential-voting clones because those are the two patterns in the official quick-start docs. This project instead
demonstrates:

- **Batch operations on encrypted data** — one `runPayroll` call updates N independent ciphertexts in a loop, not just a
  single counter.
- **Asymmetric ACL** — the employer writes the ciphertext but is _never_ granted `FHE.allow` on it, so they can't read
  it back. Only the employee can. This is a stronger and more realistic privacy property than most beginner FHEVM
  examples, where the same address that encrypts a value can usually also decrypt it.
- **Accumulating encrypted state** — balances are added to (not overwritten) across multiple payroll runs, proving FHE
  arithmetic composes correctly over time, not just in one isolated transaction.

## Contract: `contracts/ConfidentialPayroll.sol`

| Function                                            | Caller                  | What it does                                                                                            |
| --------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `addEmployee(address)`                              | employer only           | Registers an employee, initializes their encrypted balance to 0                                         |
| `runPayroll(address[], externalEuint32[], bytes[])` | employer only           | Adds an encrypted amount to each listed employee's balance in one tx                                    |
| `getMyBalance()`                                    | any registered employee | Returns the caller's own encrypted balance handle                                                       |
| `getBalanceHandle(address)`                         | anyone                  | Returns an employee's ciphertext handle (employer dashboard view — **not decryptable** by the employer) |
| `withdraw()`                                        | any registered employee | Zeroes the caller's balance, simulating a payout claim                                                  |
| `getEmployees()`                                    | anyone                  | Lists all registered employee addresses                                                                 |

## Setup (run this on your own machine — see note below)

> **Note:** contract compilation requires downloading the Solidity compiler binary from `binaries.soliditylang.org`,
> which isn't reachable from the sandboxed environment these files were drafted in. Run the commands below locally
> (Windows/Git Bash, same setup you used for DevLinks/PricePulse) where you have unrestricted internet access.

```bash
npm install
npm run compile
npm test                    # runs against the local FHEVM mock — fast, no network needed
```

Expected: all `ConfidentialPayroll` tests pass, including the one that explicitly proves Bob cannot decrypt Alice's
balance handle.

### Deploying to Sepolia

```bash
npx hardhat vars set MNEMONIC        # your wallet seed phrase (use a fresh throwaway wallet)
npx hardhat vars set INFURA_API_KEY  # from infura.io
npm run deploy:sepolia
```

Fund the deployer address with Sepolia ETH from a faucet first. After deploying, note the printed contract address — the
frontend needs it.

## What's NOT in scope for this submission (and why)

- **Real ERC-7984 token transfer.** This contract tracks an internal encrypted ledger rather than moving an actual
  confidential token, to keep the demo focused on the payroll batch + asymmetric-ACL pattern within the time available.
  The `NOTES.md` below sketches the upgrade path.
- **Overflow/underflow checks** on the encrypted arithmetic — omitted for clarity, same as Zama's own `FHECounter`
  example explicitly does.

## Demo script (for the 3-minute video)

1. Connect as the employer. Add two employees (Alice, Bob).
2. Run payroll once with two different encrypted amounts.
3. Switch wallet to Alice. Show her decrypting her own balance.
4. Switch wallet to Bob. Show his (different) balance.
5. Try to decrypt Alice's handle from Bob's session on-screen — show it fail/reject, proving the privacy guarantee live,
   not just in a test file.
6. Run payroll a second time, show balances accumulate.
