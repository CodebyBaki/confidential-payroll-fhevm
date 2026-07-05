// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialPayroll
/// @author Adavize
/// @notice Lets an employer run payroll for a list of employees in a single transaction,
///         while keeping every individual salary amount encrypted on-chain. Each employee
///         can decrypt only their own balance; no one else (not even other employees) can.
/// @dev Built on Zama's FHEVM. Salary amounts are euint32 (max ~4.29B units of the smallest
///      denomination you choose, e.g. cents). This example omits overflow checks and a real
///      ERC-7984 token transfer for clarity — see NOTES.md in the repo for the production path.
contract ConfidentialPayroll is ZamaEthereumConfig {
    /// @notice Address allowed to register employees and run payroll batches.
    address public employer;

    /// @notice Encrypted running balance per employee (what they're owed / have been paid).
    mapping(address employee => euint32 balance) private _balances;

    /// @notice Whether an address has been registered as an employee.
    mapping(address employee => bool registered) public isEmployee;

    /// @notice List of all employee addresses ever added (for iterating in the frontend).
    address[] public employeeList;

    /// @notice Emitted when the employer registers a new employee.
    /// @param employee The employee address that was registered.
    event EmployeeAdded(address indexed employee);

    /// @notice Emitted after a payroll batch updates encrypted balances.
    /// @param employeeCount Number of employees included in the batch.
    /// @param timestamp Block timestamp when the payroll batch was processed.
    event PayrollRun(uint256 employeeCount, uint256 timestamp);

    /// @notice Emitted when an employee resets their demo balance to zero.
    /// @param employee The employee address that withdrew.
    event Withdrawal(address indexed employee);

    error NotEmployer();
    error NotEmployee();
    error AlreadyEmployee();
    error ArrayLengthMismatch();

    modifier onlyEmployer() {
        if (msg.sender != employer) revert NotEmployer();
        _;
    }

    constructor() {
        employer = msg.sender;
    }

    /// @notice Register a new employee. Only the employer can call this.
    /// @param employee The address to register.
    function addEmployee(address employee) external onlyEmployer {
        if (isEmployee[employee]) revert AlreadyEmployee();
        isEmployee[employee] = true;
        employeeList.push(employee);

        // Initialize balance to encrypted zero so getBalance() never returns an
        // uninitialized handle for a registered employee.
        euint32 zero = FHE.asEuint32(0);
        _balances[employee] = zero;
        FHE.allowThis(zero);
        FHE.allow(zero, employee);

        emit EmployeeAdded(employee);
    }

    /// @notice Run payroll for a batch of employees in a single transaction.
    /// @dev Each amount is supplied as an encrypted external input (encrypted off-chain by the
    ///      employer before calling this function) plus its accompanying ZK proof. The contract
    ///      never sees the plaintext salary; it only ever computes on ciphertexts.
    /// @param employees Addresses to pay. Must already be registered via addEmployee.
    /// @param amounts Encrypted salary amounts, one per employee, same order as `employees`.
    /// @param proofs Zero-knowledge proofs of valid encryption, one per amount, same order.
    function runPayroll(
        address[] calldata employees,
        externalEuint32[] calldata amounts,
        bytes[] calldata proofs
    ) external onlyEmployer {
        if (employees.length != amounts.length || employees.length != proofs.length) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i = 0; i < employees.length; ++i) {
            address employeeAddr = employees[i];
            if (!isEmployee[employeeAddr]) revert NotEmployee();

            euint32 amount = FHE.fromExternal(amounts[i], proofs[i]);
            euint32 newBalance = FHE.add(_balances[employeeAddr], amount);
            _balances[employeeAddr] = newBalance;

            // Grant decrypt permission on the *new* ciphertext handle: the contract itself
            // (so it can keep computing on it next payroll run) and the employee (so only
            // they can ever see their own updated balance).
            FHE.allowThis(newBalance);
            FHE.allow(newBalance, employeeAddr);
        }

        emit PayrollRun(employees.length, block.timestamp);
    }

    /// @notice Returns the caller's own encrypted balance handle.
    /// @dev Anyone can call this, but only the registered employee holding decrypt
    ///      permission (granted above) will actually be able to decrypt the returned
    ///      ciphertext via the relayer SDK. Everyone else just sees an opaque handle.
    function getMyBalance() external view returns (euint32) {
        if (!isEmployee[msg.sender]) revert NotEmployee();
        return _balances[msg.sender];
    }

    /// @notice Returns an employee's encrypted balance handle, for the employer's dashboard.
    /// @param employee The employee whose encrypted balance handle should be returned.
    /// @dev The employer can see the *handle*, not the plaintext — they were never granted
    ///      FHE.allow on this ciphertext, so attempting to decrypt it client-side will fail.
    ///      This is what makes the salary confidential even from the person who set it.
    function getBalanceHandle(address employee) external view returns (euint32) {
        if (!isEmployee[employee]) revert NotEmployee();
        return _balances[employee];
    }

    /// @notice Employee claims/zeroes their balance, simulating a payout withdrawal.
    function withdraw() external {
        if (!isEmployee[msg.sender]) revert NotEmployee();

        euint32 zero = FHE.asEuint32(0);
        _balances[msg.sender] = zero;
        FHE.allowThis(zero);
        FHE.allow(zero, msg.sender);

        emit Withdrawal(msg.sender);
    }

    /// @notice Returns the full list of registered employee addresses.
    function getEmployees() external view returns (address[] memory) {
        return employeeList;
    }
}
