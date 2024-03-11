import { INFRA, PROTOCOLS, ORACLE, NATIVETOKENS, NETWORKS } from "./constants";
import { buildSwap, buildBatchSwap } from "./uni-v3/swap-tokens";
import {
  depositToYearn,
  depositToYearnBatched,
  redeemFromYearn,
  redeemFromYearnBatched
  accuredYearnInterest,
  previewWithdraw,
  getVaultAsset,
} from "./yearn/deposit-redeem";

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

export {
  INFRA,
  PROTOCOLS,
  ORACLE,
  NATIVETOKENS,
  NETWORKS,
  BASEURL,
} from "./constants";
