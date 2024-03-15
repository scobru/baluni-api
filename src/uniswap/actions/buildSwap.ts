import { BigNumberish, Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../../abis/common/ERC20.json";
import swapRouterAbi from "../../abis/uniswap/SwapRouter.json";
import routerAbi from "../../abis/infra/Router.json";
import quoterAbi from "../../abis/uniswap/Quoter.json";
import { PROTOCOLS, INFRA, NATIVETOKENS } from "../../constants";
import { BigNumber } from "bignumber.js";
import { findPoolAndFee } from "../helpers/getPoolFee";
import { quotePair } from "../helpers/quote";
import env from "dotenv";
import { parseUnits } from "ethers/lib/utils";

env.config();

function getAdjAmount(_amount: string, _decimals: number) {
  let _adjAmount: ethers.BigNumber;

  if (_decimals == 18) {
    _adjAmount = parseUnits(_amount, 18);
  } else if (_decimals == 6) {
    _adjAmount = parseUnits(_amount, 6);
  } else if (_decimals == 8) {
    _adjAmount = parseUnits(_amount, 8);
  }

  return _adjAmount;
}

export async function buildSwap(
  wallet: Wallet,
  address: string,
  token0: string,
  token1: string,
  reverse: boolean,
  protocol: string,
  chainId: string,
  amount: string,
  slippage: number
) {
  console.log("BUILD SWAP");

  const quoter = String(PROTOCOLS[chainId][protocol].QUOTER);
  const uniRouter = String(PROTOCOLS[chainId][protocol].ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);
  const infraRouter = String(INFRA[chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);
  const agentAddress = await InfraRouterContract.getAgentAddress(address);
  const tokenAAddress = reverse == true ? token1 : token0;
  const tokenBAddress = reverse == true ? token0 : token1;
  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenADecimals = await tokenAContract.decimals();

  const tokenABalance = await tokenAContract.balanceOf(address);

  console.log(
    "::API::UNISWAP::BUILDSWAP TOKEN_A_BALANCE ",
    Number(tokenABalance)
  );
  console.log("::API::UNISWAP::BUILDSWAP TOKEN_A_ADDRESS ", tokenAAddress);

  // const tokenBContract = new Contract(tokenBAddress, erc20Abi, provider);
  // const tokenBDecimals = await tokenBContract.decimals();
  // const gasLimit: Number = 30000000;
  // const gasPrice: BigNumberish = await wallet.provider.getGasPrice();
  // const gas: BigNumberish = gasPrice;

  let Approvals = [];
  let Calldatas = [];
  let adjAmount: any = ethers.BigNumber.from(0);

  console.log(
    "::API::UNISWAP::BUILDSWAP TOKEN_DECIMAL ",
    Number(tokenADecimals)
  );

  if (tokenADecimals == 0) {
    throw new Error("Invalid Token Decimals");
  }
  adjAmount = getAdjAmount(amount, tokenADecimals) as BigNumberish;
  console.log("::API::UNISWAP::BUILDSWAP AMOUNT ", Number(amount));
  console.log("::API::UNISWAP::BUILDSWAP ADJ_AMOUNT ", Number(adjAmount));

  if (tokenABalance.lt(adjAmount)) {
    throw new Error("Insufficient Balance");
    return;
  }

  if (adjAmount == 0) {
    throw new Error("Invalid Token Decimals");
  }
  const quoterContract = new Contract(quoter, quoterAbi, wallet);
  const quote = await quotePair(tokenAAddress, tokenBAddress, Number(chainId));

  const allowanceAgent: BigNumber = await tokenAContract?.allowance(
    address,
    agentAddress
  );
  const allowanceAgentToRouter: BigNumber = await tokenAContract?.allowance(
    agentAddress,
    uniRouter
  );

  const slippageTolerance = slippage;

  console.log(
    "::API::UNISWAP::BUILDSWAP ALLOWANCE_AGENT_SENDER_AMOUNT",
    Number(allowanceAgent)
  );
  console.log(
    "::API::UNISWAP::BUILDSWAP ALLOWANCE_AGENT_UNIROUTER_AMOUNT",
    Number(allowanceAgentToRouter)
  );
  console.log("::API::UNISWAP::BUILDSWAP ROUTER_ADDRESS", infraRouter);
  console.log("::API::UNISWAP::BUILDSWAP UNI_ROUTER_ADDRESS", uniRouter);
  console.log("::API::UNISWAP::BUILDSWAP AGENT_ADDRESS", agentAddress);

  // Allowance for Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (allowanceAgent.lt(adjAmount)) {
    console.log(
      "::API::UNISWAP::BUILDSWAP MISSING_ALLOWANCE_SENDER_FOR_AGENT "
    );

    const dataApproveToAgent = tokenAContract.interface.encodeFunctionData(
      "approve",
      [agentAddress, ethers.constants.MaxUint256]
    );
    const tx = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToAgent,
    };

    Approvals.push(tx);
  } else {
    console.log("::API::UNISWAP::BUILDSWAP FOUND_SENDER_ALLOWANCE_FOR_AGENT");
  }

  // Allowance for Agent to Univ3
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (allowanceAgentToRouter.lt(adjAmount)) {
    console.log(
      "::API::UNISWAP::BUILDSWAP MISSING_AGENT_ALLOWANCE_FOR_UNIROUTER "
    );

    const calldataApproveAgentToRouter =
      tokenAContract.interface.encodeFunctionData("approve", [
        uniRouter,
        ethers.constants.MaxUint256,
      ]);
    const tx = {
      to: tokenAAddress,
      value: 0,
      data: calldataApproveAgentToRouter,
    };

    Calldatas.push(tx);
  } else {
    console.log(
      "::API::UNISWAP::BUILDSWAP FOUND_AGENT_ALLOWANCE_FOR_UNIROUTER"
    );
  }

  // Transfer tokens from Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  const dataTransferFromSenderToAgent =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address,
      agentAddress,
      adjAmount,
    ]);
  const tx = {
    to: tokenAAddress,
    value: 0,
    data: dataTransferFromSenderToAgent,
  };

  if (tx)
    console.log(
      "::API::UNISWAP::BUILDSWAP BUILD_TRANSFER_FROM_SENDER_TO_AGENT"
    );

  Calldatas.push(tx);

  // Encode Swap tx to Uni Router
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (!quote) {
    console.error("❌ USDC_POOL_NOT_FOUND");
    console.log("↩️  ENCODE_WMATIC_ROUTE");

    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      NATIVETOKENS[chainId].WRAPPED,
      adjAmount,
      slippageTolerance
    );
    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee,
        adjAmount,
        0
      );

    const poolFee2 = await findPoolAndFee(
      quoterContract,
      NATIVETOKENS[chainId].WRAPPED,
      tokenBAddress,
      expectedAmountB as any,
      slippageTolerance
    );

    console.log("::API::UNISWAP::BUILDSWAP POOL_FEE", Number(poolFee));
    console.log("::API::UNISWAP::BUILDSWAP POOL_FEE2", Number(poolFee2));

    let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);

    const path = ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [
        tokenAAddress,
        poolFee,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee2,
        tokenBAddress,
      ]
    );

    /* const path = ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [tokenAAddress, 3000, NATIVETOKENS[chainId].WRAPPED, 3000, tokenBAddress]
    ); */

    let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInput", [
        swapTxInputs,
      ]);
    const tx = {
      to: PROTOCOLS[chainId][protocol].ROUTER as string,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    if (tx)
      console.log(
        "::API::UNISWAP::BUILDSWAP BUILD_AGENT_EXACT_INPUT_TO_UNIROUTER"
      );

    Calldatas.push(tx);
  } else {
    const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    console.log("::API::UNISWAP::BUILDSWAP POOL_FEE", Number(poolFee));

    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        tokenBAddress,
        poolFee,
        adjAmount,
        0
      );
    const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
      .mul(10000 - slippageTolerance)
      .div(10000);

    console.log("::API::UNISWAP::BUILDSWAP POOL_FEE", Number(poolFee));
    console.log(
      "::API::UNISWAP::BUILDSWAP SWAP_DEADLINE",
      Number(swapDeadline)
    );

    console.log("::API::UNISWAP::BUILDSWAP ADJ_AMOUNT", Number(adjAmount));
    console.log(
      "::API::UNISWAP::BUILDSWAP EXPECTED_AMOUNT_B",
      Number(expectedAmountB)
    );

    console.log(
      "::API::UNISWAP::BUILDSWAP MINIMUM_AMOUNT_B",
      Number(minimumAmountB)
    );

    const swapTxInputs = [
      tokenAAddress,
      tokenBAddress,
      poolFee,
      agentAddress,
      swapDeadline,
      adjAmount,
      minimumAmountB, // minimumAmountB edit with 0 cause slippage error
      0,
    ];
    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
        swapTxInputs,
      ]);

    const tx = {
      to: uniRouter,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    if (tx)
      console.log(
        "::API::UNISWAP::BUILDSWAP BUILD_AGENT_EXACT_INPUT_TO_UNIROUTER"
      );
    Calldatas.push(tx);
  }

  const TokensReturn = [tokenBAddress];

  console.log("::API::UNISWAP::BUILDSWAP Approvals", Approvals.length);
  console.log("::API::UNISWAP::BUILDSWAP Calldatas", Calldatas.length);
  console.log("::API::UNISWAP::BUILDSWAP TokensReturn", TokensReturn.length);

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}
