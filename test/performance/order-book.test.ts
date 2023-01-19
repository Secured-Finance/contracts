import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETHString, hexFILString, hexUSDCString } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATION_USER_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Order Book', async () => {
  let signers: SignerWithAddress[];

  let addressResolver: Contract;
  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let wUSDCToken: Contract;

  let lendingMarkets: Contract[] = [];
  let maturities: BigNumber[];

  before('Deploy Contracts', async () => {
    signers = await ethers.getSigners();

    ({
      addressResolver,
      tokenVault,
      lendingMarketController,
      wETHToken,
      wUSDCToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETHString, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDCString, wUSDCToken.address, false);

    const mockUniswapRouter = await ethers
      .getContractFactory('MockSwapRouter')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      );
    const mockUniswapQuoter = await ethers
      .getContractFactory('MockUniswapQuoter')
      .then((factory) =>
        factory.deploy(addressResolver.address, wETHToken.address),
      );

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_USER_FEE_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      mockUniswapRouter.address,
      mockUniswapQuoter.address,
    );

    await tokenVault.updateCurrency(hexETHString, true);
    await tokenVault.updateCurrency(hexUSDCString, true);

    // Deploy Lending Markets for FIL market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexFILString)
        .then((tx) => tx.wait());
    }

    lendingMarkets = await lendingMarketController
      .getLendingMarkets(hexFILString)
      .then((addresses: string[]) =>
        Promise.all(
          addresses.map((address) =>
            ethers.getContractAt('LendingMarket', address),
          ),
        ),
      );

    // Deploy Lending Markets for ETH market
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexETHString)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createLendingMarket(hexUSDCString)
        .then((tx) => tx.wait());
    }
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexFILString);
  });

  describe('Take orders without the order cleaning', async () => {
    const currencies = [
      {
        key: hexETHString,
        name: 'ETH',
        orderAmount: BigNumber.from('500000000000000000'),
      },
      {
        key: hexUSDCString,
        name: 'USDC',
        orderAmount: BigNumber.from('500000'),
      },
    ];
    const tests = [1, 10, 100];
    const log = {};

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;

      describe(`Take orders on the ${name} market`, async () => {
        for (const test of tests) {
          it(`${test} orders`, async () => {
            switch (currencyKey) {
              case hexETHString:
                contract = wETHToken;
                break;
              case hexUSDCString:
                contract = wUSDCToken;
                break;
            }

            let totalAmount = BigNumber.from(0);
            let signerIdx = 1;
            let user: Wallet = Wallet.createRandom();

            process.stdout.write('        Ordered: 0');

            for (let i = 0; i < test; i++) {
              process.stdout.write('\r\x1b[K');
              process.stdout.write(`        Ordered: ${i}/${test}`);

              if (i % 5 === 0) {
                user = waffle.provider.createEmptyWallet();

                const balance = await signers[signerIdx].getBalance();
                if (balance.lt(orderAmount.mul(10))) {
                  signerIdx++;
                }

                await signers[signerIdx]
                  .sendTransaction({
                    to: user.address,
                    value:
                      currencyKey === hexETHString
                        ? orderAmount.mul(15)
                        : BigNumber.from('500000000000000000'),
                  })
                  .then((tx) => tx.wait());

                if (currencyKey === hexETHString) {
                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, orderAmount.mul(5), {
                      value: orderAmount.mul(5),
                    })
                    .then((tx) => tx.wait());
                } else {
                  await contract
                    .connect(signers[0])
                    .transfer(user.address, orderAmount.mul(5))
                    .then((tx) => tx.wait());

                  await contract
                    .connect(user)
                    .approve(tokenVault.address, ethers.constants.MaxUint256)
                    .then((tx) => tx.wait());

                  await tokenVault
                    .connect(user)
                    .deposit(currencyKey, orderAmount.mul(5))
                    .then((tx) => tx.wait());
                }
              }

              await lendingMarketController
                .connect(user)
                .createOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  String(8000 + i),
                )
                .then((tx) => tx.wait());

              totalAmount = totalAmount.add(orderAmount);
            }
            process.stdout.write('\r\x1b[K');

            if (currencyKey === hexETHString) {
              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalAmount.mul(3).div(2), {
                  value: totalAmount.mul(3).div(2),
                })
                .then((tx) => tx.wait());
            } else {
              await contract
                .connect(signers[0])
                .approve(tokenVault.address, ethers.constants.MaxUint256)
                .then((tx) => tx.wait());

              await tokenVault
                .connect(signers[0])
                .deposit(currencyKey, totalAmount.mul(3).div(2))
                .then((tx) => tx.wait());
            }

            const receipt = await lendingMarketController
              .connect(signers[0])
              .createOrder(
                currencyKey,
                maturities[0],
                Side.BORROW,
                totalAmount,
                '0',
              )
              .then((tx) => tx.wait());

            // const PV = await lendingMarketController.getTotalPresentValue(
            //   currencyKey,
            //   signers[0].address,
            // );
            // console.log('PV:', PV.toString());

            const headerName = `GasConst(${name})`;
            if (!log[headerName]) {
              log[headerName] = {};
            }
            log[headerName][test] = receipt.gasUsed.toString();

            const orderFilledEvent = receipt.events.find(
              ({ event }) => event === 'FillOrder',
            );
            expect(orderFilledEvent?.event).to.equal('FillOrder');
            const { taker, ccy, side, maturity, amount, unitPrice } =
              orderFilledEvent.args;
            expect(taker).to.equal(signers[0].address);
            expect(ccy).to.equal(currencyKey);
            expect(side).to.equal(Side.BORROW);
            expect(maturity).to.equal(maturities[0]);
            expect(amount).to.equal(totalAmount);
            expect(unitPrice).to.equal('0');
          });
        }
      });
    }

    describe('Show results', async () => {
      it('Gas Costs', () => {
        console.table(log);
      });
    });
  });
});
