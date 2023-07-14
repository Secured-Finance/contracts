import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Contract, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

import { Side } from '../../utils/constants';
import { hexETH, hexUSDC, hexWFIL } from '../../utils/strings';
import {
  LIQUIDATION_PROTOCOL_FEE_RATE,
  LIQUIDATION_THRESHOLD_RATE,
  LIQUIDATOR_FEE_RATE,
} from '../common/constants';
import { deployContracts } from '../common/deployment';

describe('Performance Test: Order Book', async () => {
  let signers: SignerWithAddress[];

  let tokenVault: Contract;
  let lendingMarketController: Contract;
  let wETHToken: Contract;
  let usdcToken: Contract;

  let genesisDate: number;
  let maturities: BigNumber[];

  before('Deploy Contracts', async () => {
    signers = await ethers.getSigners();

    ({
      genesisDate,
      tokenVault,
      lendingMarketController,
      wETHToken,
      usdcToken,
    } = await deployContracts());

    await tokenVault.registerCurrency(hexETH, wETHToken.address, false);
    await tokenVault.registerCurrency(hexUSDC, usdcToken.address, false);

    await tokenVault.setCollateralParameters(
      LIQUIDATION_THRESHOLD_RATE,
      LIQUIDATION_PROTOCOL_FEE_RATE,
      LIQUIDATOR_FEE_RATE,
    );

    await tokenVault.updateCurrency(hexETH, true);
    await tokenVault.updateCurrency(hexUSDC, true);

    // Deploy Lending Markets
    for (let i = 0; i < 8; i++) {
      await lendingMarketController
        .createLendingMarket(hexWFIL, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createLendingMarket(hexETH, genesisDate)
        .then((tx) => tx.wait());
      await lendingMarketController
        .createLendingMarket(hexUSDC, genesisDate)
        .then((tx) => tx.wait());
    }
  });

  beforeEach('Set maturities', async () => {
    maturities = await lendingMarketController.getMaturities(hexWFIL);
  });

  describe('Take orders without the order cleaning', async () => {
    const currencies = [
      {
        key: hexETH,
        name: 'ETH',
        orderAmount: BigNumber.from('500000000000000000'),
      },
      {
        key: hexUSDC,
        name: 'USDC',
        orderAmount: BigNumber.from('500000'),
      },
    ];
    const tests = [1, 10, 100];
    const log = {};

    for (const { key: currencyKey, name, orderAmount } of currencies) {
      let contract: Contract;
      let lendingMarkets: Contract[] = [];

      describe(`Take orders on the ${name} market`, async () => {
        before('Set lending markets', async () => {
          lendingMarkets = await lendingMarketController
            .getLendingMarkets(currencyKey)
            .then((addresses) =>
              Promise.all(
                addresses.map((address) =>
                  ethers.getContractAt('LendingMarket', address),
                ),
              ),
            );
        });

        for (const test of tests) {
          it(`${test} orders`, async () => {
            switch (currencyKey) {
              case hexETH:
                contract = wETHToken;
                break;
              case hexUSDC:
                contract = usdcToken;
                break;
            }

            let totalAmount = BigNumber.from(0);
            let signerIdx = 1;
            let user: Wallet = Wallet.createRandom();
            let unitPrice = '0';

            process.stdout.write('        Ordered: 0');

            for (let i = 0; i < test; i++) {
              process.stdout.write('\r\x1b[K');
              process.stdout.write(`        Ordered: ${i}/${test}`);

              unitPrice = String(8000 - i);

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
                      currencyKey === hexETH
                        ? orderAmount.mul(15)
                        : BigNumber.from('500000000000000000'),
                  })
                  .then((tx) => tx.wait());

                if (currencyKey === hexETH) {
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
                .executeOrder(
                  currencyKey,
                  maturities[0],
                  Side.LEND,
                  orderAmount,
                  unitPrice,
                )
                .then((tx) => tx.wait());

              totalAmount = totalAmount.add(orderAmount);
            }
            process.stdout.write('\r\x1b[K');

            if (currencyKey === hexETH) {
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

            const tx = await lendingMarketController
              .connect(signers[0])
              .executeOrder(
                currencyKey,
                maturities[0],
                Side.BORROW,
                totalAmount,
                '0',
              );

            await expect(tx)
              .to.emit(lendingMarkets[0], 'OrderExecuted')
              .withArgs(
                signers[0].address,
                Side.BORROW,
                currencyKey,
                maturities[0],
                totalAmount,
                0,
                totalAmount,
                unitPrice,
                () => true,
                0,
                0,
                0,
                () => true,
              );

            const receipt = await tx.wait();

            const headerName = `GasConst(${name})`;
            if (!log[headerName]) {
              log[headerName] = {};
            }
            log[headerName][test] = receipt.gasUsed.toString();
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
