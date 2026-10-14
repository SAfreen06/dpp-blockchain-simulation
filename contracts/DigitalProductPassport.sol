// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Digital Product Passport registry
/// @notice Stores only a hash and a link per product. No product details on-chain.
contract DigitalProductPassport {
    struct Passport {
        address creator;
        bytes32 dataHash;
        string dataURI;
        uint256 version;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Passport) private _passports;

    event PassportCreated(
        uint256 indexed id,
        address creator,
        bytes32 dataHash,
        string dataURI
    );

    event PassportUpdated(
        uint256 indexed id,
        address editor,
        bytes32 oldHash,
        bytes32 newHash,
        string newURI,
        uint256 version
    );

    error PassportDoesNotExist(uint256 id);
    error NotCreator(uint256 id, address caller);

    function createPassport(bytes32 dataHash, string calldata dataURI)
        external
        returns (uint256 id)
    {
        id = _nextId++;
        _passports[id] = Passport(msg.sender, dataHash, dataURI, 1);
        emit PassportCreated(id, msg.sender, dataHash, dataURI);
    }

    function updatePassport(
        uint256 id,
        bytes32 newHash,
        string calldata newURI
    ) external {
        Passport storage p = _passports[id];
        if (p.creator == address(0)) revert PassportDoesNotExist(id);
        if (p.creator != msg.sender) revert NotCreator(id, msg.sender);

        bytes32 oldHash = p.dataHash;
        p.dataHash = newHash;
        p.dataURI = newURI;
        p.version += 1;

        emit PassportUpdated(id, msg.sender, oldHash, newHash, newURI, p.version);
    }

    function getPassport(uint256 id)
        external
        view
        returns (
            address creator,
            bytes32 dataHash,
            string memory dataURI,
            uint256 version
        )
    {
        Passport storage p = _passports[id];
        if (p.creator == address(0)) revert PassportDoesNotExist(id);
        return (p.creator, p.dataHash, p.dataURI, p.version);
    }
}