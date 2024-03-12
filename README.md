# API Documentation

## Overview

This documentation provides detailed information about the endpoints available in the API. This API interacts with Ethereum blockchain, specifically targeting token swaps via Uniswap V3, and deposit and redemption operations with Yearn Finance vaults.

## Endpoints

### General

- **GET /**
  - Description: Returns a simple "Hello World!" message.
  - Response: "Hello World!"

### Uniswap V3 Tokens

- **GET /:chainId/uni-v3/tokens**
  - Description: Fetches all tokens from the Uniswap token list filtered by `chainId`.
  - Parameters:
    - `chainId` (path): Blockchain chain ID.
  - Response: Array of token objects filtered by the specified `chainId`.

- **GET /:chainId/uni-v3/tokens/:tokenSymbol**
  - Description: Fetches a specific token by `tokenSymbol` and `chainId` from the Uniswap token list.
  - Parameters:
    - `chainId` (path): Blockchain chain ID.
    - `tokenSymbol` (path): Symbol of the token.
  - Response: Token object matching the specified `tokenSymbol` and `chainId`.

### Yearn Finance Vaults

- **GET /:chainId/yearn-v3/vaults/:tokenSymbol**
  - Description: Fetches a specific Yearn Finance vault by `tokenSymbol` and `chainId`, with optional filters for strategy type and boosted status.
  - Parameters:
    - `chainId` (path): Blockchain chain ID.
    - `tokenSymbol` (path): Symbol of the token associated with the vault.
    - `strategyType` (query): "multi" for Multi Strategy, "single" for Single Strategy.
    - `boosted` (query): "true" to filter for boosted vaults.
  - Response: Detailed information of the filtered Yearn Finance vault.

- **GET /:chainId/yearn-v3/vaults**
  - Description: Fetches all Yearn Finance vaults for a given `chainId`.
  - Parameters:
    - `chainId` (path): Blockchain chain ID.
  - Response: Array of all Yearn Finance vaults for the specified `chainId`.

### Configuration

- **GET /config/:chainId/:configType/:protocolName/:contractName**
  - Description: Fetches configuration details for a given `chainId`, `configType`, `protocolName`, and `contractName`.
  - Parameters:
    - `chainId` (path): Blockchain chain ID.
    - `configType` (path): Type of configuration.
    - `protocolName` (path): Name of the protocol.
    - `contractName` (path): Name of the contract.
  - Response: Configuration details for the specified parameters.

### Write Configuration

- **POST /write-config**
  - Description: Allows writing new configuration data. The body should include all the necessary configuration fields.
  - Body: JSON object containing the new configuration data.
  - Response: JSON object showing the updated configuration.

### Swap Tokens

- **POST /swap/:address/:token0/:token1/:reverse/:protocol/:chainId/:amount/:slippage**
  - Description: Executes a token swap operation based on the provided parameters.
  - Parameters:
    - `address`, `token0`, `token1`, `reverse`, `protocol`, `chainId`, `amount`, `slippage` are all path parameters required to perform the swap.
  - Response: Result of the swap operation, including approvals, calldata, and tokens returned.

### Deposit to Yearn Finance

- **POST /depositToYearn/:tokenSymbol/:strategy/:boosted/:amount/:receiver/:chainId**
  - Description: Deposits tokens into a specified Yearn Finance vault.
  - Parameters:
    - `tokenSymbol`, `strategy`, `boosted`, `amount`, `receiver`, `chainId` are all path parameters necessary for the deposit operation.
  - Response: Result of the deposit operation.

### Redeem from Yearn Finance

- **POST /redeemFromYearn/:tokenSymbol/:strategy/:boosted/:amount/:receiver/:chainId**
  - Description: Redeems tokens from a specified Yearn Finance vault.
  - Parameters:
    - `tokenSymbol`, `strategy`, `boosted`, `amount`, `receiver`, `chainId` are all path parameters necessary for the redemption operation.
  - Response: Result of the redemption operation.

## Models

### YearnVault
Defines the structure of a Yearn Finance vault object, including its address, name, symbol, associated token, and other relevant properties.

### Configurations
Defines the structure for configurations, used for accessing specific protocol, oracle, native tokens, and network configurations.
