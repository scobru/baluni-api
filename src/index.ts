import {
  INFRA,
  PROTOCOLS,
  ORACLE,
  NATIVETOKENS,
  NETWORKS,
  USDC,
} from "./constants";
import { buildSwap, buildBatchSwap } from "./uniswap";
import {
  depositToYearn,
  depositToYearnBatched,
  redeemFromYearn,
  redeemFromYearnBatched,
  accuredYearnInterest,
  previewWithdraw,
  getVaultAsset,
} from "./yearn/vault";

// import Router.json
import Router from "./abis/infra/Router.json";
import Agent from "./abis/infra/Agent.json";

import OffChainOracleAbi from "./abis/1inch/OffChainOracle.json";

export {
  INFRA,
  PROTOCOLS,
  ORACLE,
  NATIVETOKENS,
  NETWORKS,
  BASEURL,
  TOKENS_URL,
  USDC,
} from "./constants";

export {
  Router as RouterABI,
  Agent as AgentABI,
  OffChainOracleAbi as OffChainOracleABI,
};
export { buildSwap, buildBatchSwap };
export {
  depositToYearn,
  depositToYearnBatched,
  redeemFromYearn,
  redeemFromYearnBatched,
  accuredYearnInterest,
  previewWithdraw,
  getVaultAsset,
};

// Example function that uses the INFRA config
export function getInfraAddress(
  chainId: string,
  contractName: string
): string | undefined {
  return INFRA[chainId]?.[contractName];
}

// Example function that uses the PROTOCOLS config
export function getProtocolAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return PROTOCOLS[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the ORACLE config
export function getOracleAddress(
  chainId: string,
  protocolName: string,
  contractName: string
): string | undefined {
  return ORACLE[chainId]?.[protocolName]?.[contractName];
}

// Example function that uses the NATIVETOKENS config
export function getNativeTokenAddress(
  chainId: string,
  tokenName: string
): string | undefined {
  return NATIVETOKENS[chainId]?.[tokenName];
}

// Example function that uses the NETWORKS config
export function getNetworkRPC(chainId: string): string | undefined {
  return NETWORKS[chainId];
}
