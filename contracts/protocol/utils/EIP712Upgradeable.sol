// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (utils/cryptography/EIP712.sol)

pragma solidity ^0.8.8;

import "../../dependencies/openzeppelin/utils/cryptography/ECDSA.sol";
import "../../dependencies/openzeppelin/utils//ShortStrings.sol";
import "../../dependencies/openzeppelin/interfaces/IERC5267.sol";

import {EIP712UpgradeableStorage as Storage} from "../storages/utils/EIP712UpgradeableStorage.sol";

/**
 * @notice This contract is from OpenZeppelin Contracts that implements the EIP 712 standard
 * for hashing and signing of typed structured data.
 */
abstract contract EIP712Upgradeable is IERC5267 {
    using ShortStrings for *;

    bytes32 private constant _TYPE_HASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    /**
     * @dev Initializes the domain separator and parameter caches.
     *
     * The meaning of `name` and `version` is specified in
     * https://eips.ethereum.org/EIPS/eip-712#definition-of-domainseparator[EIP 712]:
     *
     * - `name`: the user readable name of the signing domain, i.e. the name of the DApp or the protocol.
     * - `version`: the current major version of the signing domain.
     *
     * NOTE: These parameters cannot be changed except through a xref:learn::upgrading-smart-contracts.adoc[smart
     * contract upgrade].
     */
    function __EIP712_initialize(string memory name, string memory version) internal {
        Storage.slot().name = name.toShortStringWithFallback(Storage.slot().nameFallback);
        Storage.slot().version = version.toShortStringWithFallback(Storage.slot().versionFallback);
        Storage.slot().hashedName = keccak256(bytes(name));
        Storage.slot().hashedVersion = keccak256(bytes(version));

        Storage.slot().cachedChainId = block.chainid;
        Storage.slot().cachedDomainSeparator = _buildDomainSeparator();
        Storage.slot().cachedThis = address(this);
    }

    /**
     * @dev Returns the domain separator for the current chain.
     */
    function _domainSeparatorV4() internal view returns (bytes32) {
        if (
            address(this) == Storage.slot().cachedThis &&
            block.chainid == Storage.slot().cachedChainId
        ) {
            return Storage.slot().cachedDomainSeparator;
        } else {
            return _buildDomainSeparator();
        }
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _TYPE_HASH,
                    Storage.slot().hashedName,
                    Storage.slot().hashedVersion,
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @dev Given an already https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct[hashed struct], this
     * function returns the hash of the fully encoded EIP712 message for this domain.
     *
     * This hash can be used together with {ECDSA-recover} to obtain the signer of a message. For example:
     *
     * ```solidity
     * bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
     *     keccak256("Mail(address to,string contents)"),
     *     mailTo,
     *     keccak256(bytes(mailContents))
     * )));
     * address signer = ECDSA.recover(digest, signature);
     * ```
     */
    function _hashTypedDataV4(bytes32 structHash) internal view virtual returns (bytes32) {
        return ECDSA.toTypedDataHash(_domainSeparatorV4(), structHash);
    }

    /**
     * @dev See {EIP-5267}.
     *
     * _Available since v4.9._
     */
    function eip712Domain()
        public
        view
        virtual
        override
        returns (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        )
    {
        return (
            hex"0f", // 01111
            Storage.slot().name.toStringWithFallback(Storage.slot().nameFallback),
            Storage.slot().version.toStringWithFallback(Storage.slot().versionFallback),
            block.chainid,
            address(this),
            bytes32(0),
            new uint256[](0)
        );
    }
}
