// server.ts
import express from "express";
import { PROTOCOLS, ORACLE, NATIVETOKENS, NETWORKS } from "./constants";

import { buildSwap } from "./uni-v3/swap-tokens";
import { BigNumber, ethers } from "ethers";
import { depositToYearn, redeemFromYearn } from "./yearn/deposit-redeem";

const app = express();
const port = 3001;

interface YearnVault {
  address: string;
  name: string;
  symbol: string;
  token: {
    address: string;
    name: string;
    symbol: string;
  };
  strategies?: any[];
  migration?: {
    available: boolean;
    address: string;
    contract: string;
  };
  staking?: {
    available: boolean;
    address: string;
    tvl: number;
    risk: number;
  };
  kind: string;
  version?: string;
  boosted: boolean; // Assuming there's a version field, adjust based on actual API response
}

interface Configurations {
  [key: string]: any; // Use a more specific type if possible for your configurations
}

// Unified configuration object
const CONFIGURATIONS: Configurations = {
  protocols: PROTOCOLS,
  oracle: ORACLE,
  nativeTokens: NATIVETOKENS,
  networks: NETWORKS,
};

const TOKENS_URL = "https://gateway.ipfs.io/ipns/tokens.uniswap.org";

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Example: GET /1/uni-v3/tokens
app.get("/:chainId/uni-v3/tokens", async (req, res) => {
  try {
    const response = await fetch(TOKENS_URL);
    const data = await response.json();
    const { chainId } = req.params;

    // Filter tokens by chainId if needed, for example, chainId 137 (Polygon)
    const filteredTokens = data.tokens.filter(
      (token: { chainId: number }) => token.chainId === Number(chainId)
    );

    res.json(filteredTokens);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tokens", error: error });
  }
});

// Example: GET /1/uni-v3/tokens/USDC
app.get("/:chainId/uni-v3/tokens/:tokenSymbol", async (req, res) => {
  const { chainId, tokenSymbol } = req.params;

  if (!chainId || !tokenSymbol) {
    return res
      .status(400)
      .json({ error: "Missing chainId or tokenName query parameter" });
  }

  try {
    const response = await fetch(TOKENS_URL);
    const data = await response.json();

    // Filter tokens by chainId and then try to find a token that matches the tokenName
    const matchingTokens = data.tokens.filter(
      (token: { chainId: number; symbol: string }) =>
        token.chainId === Number(chainId) &&
        token.symbol.toLowerCase() === tokenSymbol.toString().toLowerCase()
    );

    if (matchingTokens.length === 0) {
      return res.status(404).json({ error: "Token not found" });
    }

    res.json(matchingTokens[0]); // Returns the first matching token, assuming names are unique per chainId
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tokens", error: error });
  }
});

// Example: GET /1/yearn-v3/vaults/USDC
app.get("/:chainId/yearn-v3/vaults/:tokenSymbol", async (req, res) => {
  const { tokenSymbol, chainId } = req.params;
  const { strategyType, boosted } = req.query; // "multi" for Multi Strategy, "single" for Single Strategy, and "boosted" for filtering boosted vaults
  const apiURL = `https://ydaemon.yearn.fi/${chainId}/vaults/all`;

  try {
    const response = await fetch(apiURL);
    const data: YearnVault[] = await response.json();

    let filteredVaults = data.filter((vault) => {
      const matchesSymbol =
        vault.token.symbol.toLowerCase() === tokenSymbol.toLowerCase();
      const isVersion3 =
        vault.version?.startsWith("3.0") ||
        vault.name.includes("3.0") ||
        vault.symbol.includes("3.0");
      let matchesStrategyType = true;
      let matchesBoosted = true;

      if (strategyType === "multi") {
        matchesStrategyType = vault.kind === "Multi Strategy";
      } else if (strategyType === "single") {
        matchesStrategyType = vault.kind !== "Multi Strategy";
      }

      // Check if boosted filter is applied
      if (boosted === "true") {
        matchesBoosted = vault.boosted === true;
      }

      return (
        matchesSymbol && isVersion3 && matchesStrategyType && matchesBoosted
      );
    });

    if (filteredVaults.length === 0) {
      return res
        .status(404)
        .json({ error: "Vault not found for the given criteria" });
    }

    const vault = filteredVaults[0];
    res.json({
      vaultAddress: vault.address,
      vaultName: vault.name,
      vaultSymbol: vault.symbol,
      tokenAddress: vault.token.address,
      tokenName: vault.token.name,
      tokenSymbol: vault.token.symbol,
      strategyType: vault.kind,
      version: vault.version,
      boosted: vault.boosted, // Include boosted status in the response
    });
  } catch (error) {
    console.error("Failed to fetch Yearn Finance vaults:", error);
    res.status(500).json({ error: "Failed to fetch Yearn Finance vaults" });
  }
});

// Example: GET /1/yearn-v3/vaults/
app.get("/:chainId/yearn-v3/vaults", async (req, res) => {
  const { chainId } = req.params;
  const apiURL = `https://ydaemon.yearn.fi/${chainId}/vaults/all`;

  try {
    const response = await fetch(apiURL);
    const data: YearnVault[] = await response.json();

    // Filter vaults only by the token symbol

    // Respond with all matching vaults instead of just the first match
    res.json(
      data.map((vault) => ({
        vaultAddress: vault.address,
        vaultName: vault.name,
        vaultSymbol: vault.symbol,
        tokenAddress: vault.token.address,
        tokenName: vault.token.name,
        tokenSymbol: vault.token.symbol,
        // Optional: include other properties here if needed
      }))
    );
  } catch (error) {
    console.error("Failed to fetch Yearn Finance vaults:", error);
    res.status(500).json({ error: "Failed to fetch Yearn Finance vaults." });
  }
});

// Example: GET /config/1/protocols/uni-v3/ROUTER
app.get(
  "/config/:chainId/:configType/:protocolName/:contractName",
  (req, res) => {
    const { chainId, configType, contractName, protocolName } = req.params;

    // Accessing the specific configuration based on chainId, configType, and contractName
    const config =
      CONFIGURATIONS[configType]?.[chainId]?.[protocolName]?.[
        contractName.toUpperCase()
      ];

    if (!config) {
      return res
        .status(404)
        .json({ error: "Configuration not found for the given parameters" });
    }

    res.json({ chainId, configType, contractName, address: config });
  }
);

// Example: POST /write-config
app.post("/write-config", async (req, res) => {
  const {
    tokens,
    weightsUp,
    weightsDown,
    chainId,
    yearnEnabled,
    yearnVaults,
    limit,
    slippage,
    interval,
    maxApproval,
    investmentInterval,
    investmentAmount,
    trendFollowing,
    kstTimeframe,
    prediction,
    predictionPeriod,
    predictionEpochs,
    predictionSymbol,
    predictionAlgo,
    tecnicalAnalysis,
    rsiPeriod,
    rsiOverbought,
    rsiOversold,
    rsiTimeframe,
    stockRsiPeriod,
    stockRsiOverbought,
    stockRsiOversold,
    emaTimeframe,
    emaPeriod,
    emaSymbol,
    emaFast,
    emaSlow,
    vwapPeriod,
  } = req.body;
  const updatedWeightsDown: Record<string, number> = {};
  const updatedWeightsUp: Record<string, number> = {};
  const updatedYearnVaults: Record<string, string> = {};

  const tokenAddresses = await Promise.all(
    tokens.map((tokenSymbol: string) =>
      fetchTokenAddressByName(tokenSymbol, chainId)
    )
  );

  tokenAddresses.forEach((address, index) => {
    if (address) {
      updatedWeightsUp[address] = weightsUp[tokens[index]] ?? 0;
      updatedWeightsDown[address] = weightsDown[tokens[index]] ?? 0;
    }
  });

  // Se yearnEnabled è true, recupera i dati dei vault di Yearn
  if (yearnEnabled) {
    const yearnVaultsData = await fetchYearnVaultsData(chainId);

    // Itera sui token per cui sono configurati i vault di Yearn
    for (const [tokenSymbol, config] of Object.entries(yearnVaults[chainId])) {
      // Ora `config` è del tipo corretto
      const tokenConfig: any = config;

      const filteredVaults = yearnVaultsData
        .filter((vault: YearnVault) => {
          const matchesSymbol =
            vault.token.symbol.toLowerCase() === tokenSymbol.toLowerCase();
          const isVersion3 =
            vault.version?.startsWith("3.0") ||
            vault.name.includes("3.0") ||
            vault.symbol.includes("3.0");
          let matchesStrategyType = true;
          let matchesBoosted = true;

          if (tokenConfig.strategy === "multi") {
            matchesStrategyType = vault.kind === "Multi Strategy";
          } else if (tokenConfig.strategy === "single") {
            matchesStrategyType = vault.kind !== "Multi Strategy";
          }

          // Check if boosted filter is applied
          if (tokenConfig.boosted === "true") {
            matchesBoosted = vault.boosted === true;
          }

          return (
            matchesSymbol && isVersion3 && matchesStrategyType && matchesBoosted
          );
        })
        .map((vault: YearnVault) => vault.address);

      if (filteredVaults.length > 0) {
        updatedYearnVaults[tokenSymbol] = filteredVaults[0];
      }
    }
  }

  res.json({
    // Proprietà esistenti
    TOKENS: tokenAddresses, // Indirizzi dei token
    WEIGHTS_UP: updatedWeightsUp, // Pesi aggiornati per l'aumento di prezzo
    WEIGHTS_DOWN: updatedWeightsDown, // Pesi aggiornati per il calo di prezzo
    USDC: await fetchTokenAddressByName("USDC.E", chainId),
    NATIVE: NATIVETOKENS[chainId]?.NATIVE,
    WRAPPED: NATIVETOKENS[chainId]?.WRAPPED,
    ORACLE: ORACLE[chainId]?.["1inch-spot-agg"]?.OFFCHAINORACLE,
    ROUTER: PROTOCOLS[chainId]?.["uni-v3"]?.ROUTER,
    QUOTER: PROTOCOLS[chainId]?.["uni-v3"]?.QUOTER,
    FACTORY: PROTOCOLS[chainId]?.["uni-v3"]?.FACTORY,
    NETWORKS: NETWORKS[chainId],
    YEARN_ENABLED: yearnEnabled,
    YEARN_VAULTS: updatedYearnVaults,
    LIMIT: limit,
    SLIPPAGE: slippage,
    INTERVAL: interval,
    MAX_APPROVAL: maxApproval,
    INVESTMENT_INTERVAL: investmentInterval,
    INVESTMENT_AMOUNT: investmentAmount,
    TREND_FOLLOWING: trendFollowing,
    KST_TIMEFRAME: kstTimeframe,
    PREDICTION: prediction,
    PREDICTION_PERIOD: predictionPeriod,
    PREDICTION_EPOCHS: predictionEpochs,
    PREDICTION_SYMBOL: predictionSymbol,
    PREDICTION_ALGO: predictionAlgo,
    TECNICAL_ANALYSIS: tecnicalAnalysis,
    RSI_PERIOD: rsiPeriod,
    RSI_OVERBOUGHT: rsiOverbought,
    RSI_OVERSOLD: rsiOversold,
    RSI_TIMEFRAME: rsiTimeframe,
    STOCKRSI_PERIOD: stockRsiPeriod,
    STOCKRSI_OVERBOUGHT: stockRsiOverbought,
    STOCKRSI_OVERSOLD: stockRsiOversold,
    EMA_TIMEFRAME: emaTimeframe,
    EMA_PERIOD: emaPeriod,
    EMA_SYMBOL: emaSymbol,
    EMA_FAST: emaFast,
    EMA_SLOW: emaSlow,
    VWAP_PERIOD: vwapPeriod,
    SELECTED_CHAINID: chainId,
  });
});

// Example: POST /swap/0x1234.../USDC/ETH/false/uni-v3/1/100
app.post(
  "/swap/:address/:token0/:token1/:reverse/:protocol/:chainId/:amount/:slippage",
  async (req, res) => {
    const {
      address,
      token0,
      token1,
      reverse,
      protocol,
      chainId,
      amount,
      slippage,
    } = req.params;

    try {
      const tokenAAddress = await fetchTokenAddressByName(
        token0,
        Number(chainId)
      );

      const tokenBAddress = await fetchTokenAddressByName(
        token1,
        Number(chainId)
      );

      const wallet = new ethers.Wallet(
        process.env.PRIVATE_KEY,
        new ethers.providers.JsonRpcProvider(NETWORKS[chainId])
      );

      const swapResult = await buildSwap(
        wallet,
        address,
        tokenAAddress!,
        tokenBAddress!,
        Boolean(reverse),
        protocol,
        chainId,
        amount,
        Number(slippage)
      );

      // Prepare and send the response using the structure from the swap function output
      console.log("Swap result:", swapResult);

      res.json({
        Approvals: swapResult.Approvals,
        Calldatas: swapResult.Calldatas,
        TokensReturn: swapResult.TokensReturn,
      });
    } catch (error) {
      console.error("Error during swap operation:", error);
      res.status(500).json({ error: "Error during swap operation" });
    }
  }
);

app.post(
  "/depositToYearn/:tokenSymbol/:strategy/:boosted/:amount/:receiver/:chainId",
  async (req, res) => {
    try {
      const { tokenSymbol, strategy, amount, receiver, chainId, boosted } =
        req.params;

      // Ora `config` è del tipo corretto
      const filteredVaults = await fetchYearnVaultsData(Number(chainId));

      filteredVaults
        .filter((vault) => {
          const matchesSymbol =
            vault.token.symbol.toLowerCase() === tokenSymbol.toLowerCase();
          const isVersion3 =
            vault.version?.startsWith("3.0") ||
            vault.name.includes("3.0") ||
            vault.symbol.includes("3.0");
          let matchesStrategyType = true;
          let matchesBoosted = true;

          if (strategy === "multi") {
            matchesStrategyType = vault.kind === "Multi Strategy";
          } else if (strategy === "single") {
            matchesStrategyType = vault.kind !== "Multi Strategy";
          }

          // Check if boosted filter is applied
          if (boosted === "true") {
            matchesBoosted = vault.boosted === true;
          }

          return (
            matchesSymbol && isVersion3 && matchesStrategyType && matchesBoosted
          );
        })
        .map((vault) => vault.address);

      const vaultAddress = filteredVaults[0];
      const tokenAddress = await fetchTokenAddressByName(
        tokenSymbol,
        Number(chainId)
      );

      // Convert the wallet from JSON to an ethers.Wallet instance
      const walletInstance = new ethers.Wallet(
        process.env.PRIVATE_KEY,
        new ethers.providers.JsonRpcProvider(NETWORKS[chainId])
      );

      // Convert the amount from string to BigNumber
      const amountInstance = BigNumber.from(amount);

      const result = await depositToYearn(
        walletInstance,
        tokenAddress,
        vaultAddress.address,
        amountInstance,
        receiver,
        chainId
      );

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.toString() });
    }
  }
);

app.post(
  "/redeemFromYearn/:tokenSymbol/:strategy/:boosted/:amount/:receiver/:chainId",
  async (req, res) => {
    try {
      const { tokenSymbol, strategy, amount, receiver, chainId, boosted } =
        req.params;

      // Convert the amount from string to BigNumber
      const amountInstance = BigNumber.from(amount);

      // Ora `config` è del tipo corretto
      const filteredVaults = await fetchYearnVaultsData(Number(chainId));

      filteredVaults
        .filter((vault) => {
          const matchesSymbol =
            vault.token.symbol.toLowerCase() === tokenSymbol.toLowerCase();
          const isVersion3 =
            vault.version?.startsWith("3.0") ||
            vault.name.includes("3.0") ||
            vault.symbol.includes("3.0");
          let matchesStrategyType = true;
          let matchesBoosted = true;

          if (strategy === "multi") {
            matchesStrategyType = vault.kind === "Multi Strategy";
          } else if (strategy === "single") {
            matchesStrategyType = vault.kind !== "Multi Strategy";
          }

          // Check if boosted filter is applied
          if (boosted === "true") {
            matchesBoosted = vault.boosted === true;
          }

          return (
            matchesSymbol && isVersion3 && matchesStrategyType && matchesBoosted
          );
        })
        .map((vault) => vault.address);

      const vaultAddress = filteredVaults[0];

      // Convert the wallet from JSON to an ethers.Wallet instance
      const walletInstance = new ethers.Wallet(
        process.env.PRIVATE_KEY,
        new ethers.providers.JsonRpcProvider(NETWORKS[chainId])
      );

      const result = await redeemFromYearn(
        walletInstance,
        vaultAddress.address,
        amountInstance,
        receiver,
        chainId
      );

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.toString() });
    }
  }
);

// HELPER FUNCTIONS

// Fetch Yearn Finance vaults data
async function fetchYearnVaultsData(chainId: number): Promise<YearnVault[]> {
  try {
    const apiURL = `https://ydaemon.yearn.fi/${chainId}/vaults/all`;
    const response = await fetch(apiURL);
    const data: YearnVault[] = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch Yearn Finance vaults:", error);
    return [];
  }
}

// Fetch token address by name from the Uniswap token list
async function fetchTokenAddressByName(
  tokenSymbol: string,
  chainId: number
): Promise<string | null> {
  try {
    const response = await fetch(TOKENS_URL);
    const data = await response.json();

    // Filtra i token per chainId e cerca un token che corrisponda al tokenSymbol fornito
    const matchingToken = data.tokens.find(
      (token: { chainId: number; symbol: string }) =>
        token.chainId === chainId &&
        token.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    );

    // Se il token esiste, restituisci il suo indirizzo
    return matchingToken ? matchingToken.address : null;
  } catch (error) {
    console.error("Failed to fetch token address:", error);
    return null;
  }
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
