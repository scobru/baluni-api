import { BigNumberish, Contract, Wallet, ethers, providers } from "ethers";
import erc20Abi from "../../abis/common/ERC20.json";
import swapRouterAbi from "../../abis/uniswap/SwapRouter.json";
import routerAbi from "../../abis/infra/Router.json";
import quoterAbi from "../../abis/uniswap/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA, NATIVETOKENS } from "../../constants";
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

export async function buildBatchSwap(
  swaps: Array<{
    wallet: Wallet;
    address: string;
    token0: string;
    token1: string;
    reverse: boolean;
    protocol: string;
    chainId: string;
    amount: string;
    slippage: number;
  }>
) {
  console.log("Building Batch Swap tx");
  const provider = new ethers.providers.JsonRpcProvider(
    NETWORKS[swaps[0].chainId]
  );
  const wallet = swaps[0].wallet;
  const protocol = PROTOCOLS[swaps[0].chainId][swaps[0].protocol];

  const infraRouter = String(INFRA[swaps[0].chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);

  const uniRouter = String(protocol.ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);

  const quoter = String(protocol.QUOTER);
  const quoterContract = new Contract(quoter, quoterAbi, wallet);

  let Approvals = [];
  let Calldatas = [];
  let TokensReturn = [];

  console.log("::API::UNISWAP::BUILDSWAP:BATCHED ROUTER", infraRouter);
  console.log("::API::UNISWAP::BUILDSWAP:BATCHED UNIROUTER", uniRouter);

  for (let swap of swaps) {
    const agentAddress = await InfraRouterContract?.getAgentAddress(
      swap.address
    );
    console.log("::API::UNISWAP::BUILDSWAP:BATCHED AGENT", agentAddress);

    const tokenAAddress = swap.reverse ? swap.token1 : swap.token0;
    const tokenBAddress = swap.reverse ? swap.token0 : swap.token1;

    const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
    const tokenABalance = await tokenAContract?.balanceOf(swap.address);

    console.log("::API::UNISWAP::BUILDSWAP:BATCHED TOKEN_A", tokenAAddress);
    console.log("::API::UNISWAP::BUILDSWAP:BATCHED TOKEN_B", tokenBAddress);
    console.log(
      "::API::UNISWAP::BUILDSWAP:BATCHED BALANCE",
      Number(tokenABalance)
    );

    const allowanceAgent = await tokenAContract?.allowance(
      swap.address,
      agentAddress
    );
    const tokenADecimals = await tokenAContract.decimals();

    let adjAmount: any = ethers.BigNumber.from(0);

    console.log(
      "::API::UNISWAP::BUILDSWAP:BATCHED AMOUNT:",
      String(swap.amount)
    );

    adjAmount = getAdjAmount(swap.amount, tokenADecimals);

    console.log(
      "::API::UNISWAP::BUILDSWAP:BATCHED ADJ_AMOUNT:",
      String(adjAmount)
    );

    // Allowance for Agent to Sender
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    if (adjAmount.gt(allowanceAgent)) {
      console.log(
        "::API::UNISWAP::BUILDSWAP:BATCHED MISSING_ALLOWANCE_AGENT_TO_SENDER"
      );

      const dataApproveToAgent = tokenAContract?.interface.encodeFunctionData(
        "approve",
        [agentAddress, ethers.constants.MaxUint256]
      );
      const approvalToAgent = {
        to: tokenAAddress,
        value: 0,
        data: dataApproveToAgent,
      };

      Approvals.push(approvalToAgent);
    } else {
      console.log(
        "::API::UNISWAP::BUILDSWAP:BATCHED FOUND_ALLOWANCE_AGENT_TO_SENDER"
      );
    }

    // Check allowance Router to UniRouter
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const allowanceAgentToUniRouter = await tokenAContract?.allowance(
      agentAddress,
      uniRouter
    );

    if (adjAmount.gt(allowanceAgentToUniRouter)) {
      console.log(
        "::API::UNISWAP::BUILDSWAP:BATCHED MISSING_ALLOWANCE_AGENT_TO_UNIROUTER"
      );

      const calldataApproveAgentToRouter =
        tokenAContract.interface.encodeFunctionData("approve", [
          uniRouter,
          ethers.constants.MaxUint256,
        ]);

      const approvalAgentToRouter = {
        to: tokenAAddress,
        value: 0,
        data: calldataApproveAgentToRouter,
      };

      Calldatas.push(approvalAgentToRouter);
    } else {
      console.log(
        "::API::UNISWAP::BUILDSWAP:BATCHED FOUND_ALLOWANCE_AGENT_TO_UNIROUTER"
      );
    }

    // Transfer tokens from Sender to Agent
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const dataTransferFromSenderToAgent =
      tokenAContract.interface.encodeFunctionData("transferFrom", [
        swap.address,
        agentAddress,
        adjAmount,
      ]);

    const transferFromSenderToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataTransferFromSenderToAgent,
    };

    if (transferFromSenderToAgent)
      console.log(
        "::API::UNISWAP::BUILDSWAP:BATCHED BUILD_TRANSFER_FROM_SENDER_TO_AGENT"
      );

    Calldatas.push(transferFromSenderToAgent);

    // Encode Swap tx to Uni Router
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const quote = await quotePair(
      tokenAAddress,
      tokenBAddress,
      Number(swap.chainId)
    );

    const slippageTolerance = swap.slippage;

    if (!quote) {
      console.error("❌ USDC Pool Not Found");
      console.log("↩️ Using WMATIC route");

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        NATIVETOKENS[swap.chainId].WRAPPED,
        adjAmount,
        slippageTolerance
      );
      const expectedAmountB: BigNumber =
        await quoterContract?.callStatic?.quoteExactInputSingle?.(
          tokenAAddress,
          NATIVETOKENS[swap.chainId].WRAPPED,
          poolFee,
          adjAmount,
          0
        );

      const poolFee2 = await findPoolAndFee(
        quoterContract,
        NATIVETOKENS[swap.chainId].WRAPPED,
        tokenBAddress,
        expectedAmountB as any, // Convert expectedAmountB to BigNumber
        slippageTolerance
      );

      let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60); // 1 hour from now

      const path = ethers.utils.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [
          tokenAAddress,
          poolFee,
          NATIVETOKENS[swap.chainId].WRAPPED,
          poolFee2,
          tokenBAddress,
        ]
      );

      let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInput", [
          swapTxInputs,
        ]);
      const swapMultiAgentToRouter = {
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      if (swapMultiAgentToRouter)
        console.log(
          "::API::UNISWAP::BUILDSWAP:BATCHED BUILD_AGENT_EXACT_INPUT_TO_UNIROUTER"
        );
      Calldatas.push(swapMultiAgentToRouter);
      TokensReturn.push(tokenBAddress);
    } else {
      const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
      const quoterAddress = quoter;

      const quoterContract = new Contract(quoterAddress, quoterAbi, provider);
      const slippageTolerance = swap.slippage;

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        tokenBAddress,
        adjAmount,
        slippageTolerance
      );

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

      const swapTxInputs = [
        tokenAAddress,
        tokenBAddress,
        poolFee,
        agentAddress!,
        swapDeadline,
        adjAmount,
        minimumAmountB,
        0,
      ];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
          swapTxInputs,
        ]);
      const swapAgentToRouter = {
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      if (swapAgentToRouter)
        console.log(
          "::API::UNISWAP::BUILDSWAP:BATCHED BUILD_AGENT_EXACT_INPUT_TO_UNIROUTER"
        );

      Calldatas.push(swapAgentToRouter);
      TokensReturn.push(tokenBAddress);
    }
  }
  console.log("::API::UNISWAP::BUILDSWAP:BATCHED Approvals", Approvals.length);
  console.log("::API::UNISWAP::BUILDSWAP:BATCHED Calldatas", Calldatas.length);
  console.log(
    "::API::UNISWAP::BUILDSWAP:BATCHED TokensReturn",
    TokensReturn.length
  );

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}
