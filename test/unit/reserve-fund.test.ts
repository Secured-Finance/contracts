import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { artifacts, ethers, waffle } from 'hardhat';

// contracts
const AddressResolver = artifacts.require('AddressResolver');
const LendingMarketController = artifacts.require('LendingMarketController');
const MigrationAddressResolver = artifacts.require('MigrationAddressResolver');
const ReserveFund = artifacts.require('ReserveFund');
const ProxyController = artifacts.require('ProxyController');
const TokenVault = artifacts.require('TokenVault');
const WETH9 = artifacts.require('MockWETH9');

const { deployContract, deployMockContract } = waffle;

describe('ReserveFund', () => {
  let mockTokenVault: MockContract;
  let mockLendingMarketController: MockContract;
  let mockWETH: MockContract;
  let reserveFundProxy: Contract;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let signers: SignerWithAddress[];

  let targetCurrency: string;
  let currencyIdx = 0;

  before(async () => {
    [owner, alice, bob, ...signers] = await ethers.getSigners();

    // Set up for the mocks
    mockTokenVault = await deployMockContract(owner, TokenVault.abi);
    mockLendingMarketController = await deployMockContract(
      owner,
      LendingMarketController.abi,
    );
    mockWETH = await deployMockContract(owner, WETH9.abi);
    await mockTokenVault.mock.deposit.returns();
    await mockTokenVault.mock.withdraw.returns();
    await mockTokenVault.mock.getTokenAddress.returns(
      ethers.constants.AddressZero,
    );
    await mockLendingMarketController.mock.executeEmergencySettlement.returns(
      true,
    );
    await mockWETH.mock.transferFrom.returns(true);
    await mockWETH.mock.transfer.returns(true);
    await mockWETH.mock.approve.returns(true);
    await mockWETH.mock.deposit.returns();

    // Deploy contracts
    const addressResolver = await deployContract(owner, AddressResolver);
    const proxyController = await deployContract(owner, ProxyController, [
      ethers.constants.AddressZero,
    ]);
    const reserveFund = await deployContract(owner, ReserveFund);

    // Get the Proxy contract addresses
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const reserveFundAddress = await proxyController
      .setReserveFundImpl(reserveFund.address, mockWETH.address)
      .then((tx) => tx.wait())
      .then(
        ({ events }) =>
          events.find(({ event }) => event === 'ProxyUpdated').args
            .proxyAddress,
      );

    // Get the Proxy contracts
    const addressResolverProxy = await ethers.getContractAt(
      'AddressResolver',
      addressResolverProxyAddress,
    );
    reserveFundProxy = await ethers.getContractAt(
      'ReserveFund',
      reserveFundAddress,
    );

    // Deploy MigrationAddressResolver
    const migrationAddressResolver = await MigrationAddressResolver.new(
      addressResolverProxyAddress,
    );

    // Set up for AddressResolver and build caches using MigrationAddressResolver
    const migrationTargets: [string, Contract][] = [
      ['TokenVault', mockTokenVault],
      ['LendingMarketController', mockLendingMarketController],
      ['ReserveFund', reserveFundProxy],
    ];

    const importAddressesArgs = {
      names: migrationTargets.map(([name]) =>
        ethers.utils.formatBytes32String(name),
      ),
      addresses: migrationTargets.map(([, contract]) => contract.address),
    };

    await addressResolverProxy.importAddresses(
      importAddressesArgs.names,
      importAddressesArgs.addresses,
    );
    await migrationAddressResolver.buildCaches([reserveFundProxy.address]);
  });

  beforeEach(async () => {
    targetCurrency = ethers.utils.formatBytes32String(`Test${currencyIdx}`);
    currencyIdx++;
  });

  describe('Initialize', async () => {
    it('Fail to call initialization due to duplicate execution', async () => {
      await expect(
        reserveFundProxy.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ),
      ).revertedWith('Initializable: contract is already initialized');
    });

    it('Fail to call initialization due to execution by non-proxy contract', async () => {
      const reserveFund = await deployContract(owner, ReserveFund);

      await expect(
        reserveFund.initialize(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ),
      ).revertedWith('Must be called from proxy contract');
    });
  });

  describe('Pause', async () => {
    it('Pause and Unpause', async () => {
      expect(await reserveFundProxy.isPaused()).to.false;

      await expect(reserveFundProxy.pause()).to.emit(reserveFundProxy, 'Pause');
      expect(await reserveFundProxy.isPaused()).to.true;

      await expect(reserveFundProxy.unpause()).to.emit(
        reserveFundProxy,
        'Unpause',
      );
      expect(await reserveFundProxy.isPaused()).to.false;
    });

    it('Change the operator', async () => {
      await expect(reserveFundProxy.connect(bob).pause()).to.be.revertedWith(
        'CallerNotOperator',
      );
      await expect(reserveFundProxy.connect(bob).unpause()).to.be.revertedWith(
        'CallerNotOperator',
      );

      await reserveFundProxy.addOperator(bob.address);

      await expect(reserveFundProxy.connect(bob).pause()).to.be.not.reverted;
      await expect(reserveFundProxy.connect(bob).unpause()).to.be.not.reverted;

      await reserveFundProxy.removeOperator(bob.address);

      await expect(reserveFundProxy.connect(bob).pause()).to.be.revertedWith(
        'CallerNotOperator',
      );
      await expect(reserveFundProxy.connect(bob).unpause()).to.be.revertedWith(
        'CallerNotOperator',
      );
    });

    it('Remove operator role from another user', async () => {
      const role = await reserveFundProxy.OPERATOR_ROLE();
      await reserveFundProxy.addOperator(alice.address);
      await reserveFundProxy.revokeRole(role, alice.address);
    });

    it('Fail to pause due to non-operator caller', async () => {
      await expect(reserveFundProxy.connect(alice).pause()).to.be.revertedWith(
        'CallerNotOperator',
      );
    });

    it('Fail to unpause due to non-operator caller', async () => {
      await expect(
        reserveFundProxy.connect(alice).unpause(),
      ).to.be.revertedWith('CallerNotOperator');
    });

    it('Fail to revoke role due to own role', async () => {
      const role = await reserveFundProxy.OPERATOR_ROLE();
      await expect(
        reserveFundProxy.connect(alice).revokeRole(role, alice.address),
      ).to.be.revertedWith(`NotAllowedAccess("${role}", "${alice.address}")`);
    });

    it('Fail to renounce role due to not allowed access', async () => {
      const role = await reserveFundProxy.DEFAULT_ADMIN_ROLE();
      await expect(
        reserveFundProxy.connect(alice).renounceRole(role, alice.address),
      ).to.be.revertedWith('NotAllowedAccess');
    });
  });

  describe('Deposit', async () => {
    it('Deposit ERC20 token', async () => {
      await reserveFundProxy.deposit(targetCurrency, '10000000');
    });

    it('Deposit ETH', async () => {
      await reserveFundProxy.deposit(targetCurrency, '10000000', {
        value: '10000000',
      });
    });

    it('Fail to deposit token due to execution by non-owner', async () => {
      await expect(
        reserveFundProxy.connect(alice).deposit(targetCurrency, '10000000'),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Withdraw', async () => {
    it('Withdraw funds', async () => {
      await reserveFundProxy.withdraw(targetCurrency, '10000000');
    });

    it('Fail to withdraw token due to execution by non-owner', async () => {
      await expect(
        reserveFundProxy.connect(alice).withdraw(targetCurrency, '10000000'),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Execute transaction', async () => {
    it('Execute emergency settlement', async () => {
      const payload = mockLendingMarketController.interface.encodeFunctionData(
        'executeEmergencySettlement',
      );
      await expect(
        reserveFundProxy.executeTransaction(
          mockLendingMarketController.address,
          payload,
        ),
      ).to.emit(reserveFundProxy, 'TransactionExecuted');
    });

    it('Execute a deposit transaction', async () => {
      const approveData = mockWETH.interface.encodeFunctionData(
        'approve(address,uint256)',
        [mockWETH.address, 1000],
      );
      const depositData = mockTokenVault.interface.encodeFunctionData(
        'deposit(bytes32,uint256)',
        [targetCurrency, 1000],
      );

      const targets = [mockWETH.address, mockTokenVault.address];
      const values = [0, 0];
      const data = [approveData, depositData];

      const tx = await reserveFundProxy.executeTransactions(
        targets,
        values,
        data,
      );

      await expect(tx)
        .to.emit(reserveFundProxy, 'TransactionExecuted')
        .withArgs(owner.address, targets[0], values[0], data[0]);
      await expect(tx)
        .to.emit(reserveFundProxy, 'TransactionExecuted')
        .withArgs(owner.address, targets[1], values[1], data[1]);
    });

    it('Fail to execute a transaction due to execution by non-owner', async () => {
      const payload = mockLendingMarketController.interface.encodeFunctionData(
        'executeEmergencySettlement',
      );
      await expect(
        reserveFundProxy
          .connect(alice)
          .executeTransaction(ethers.constants.AddressZero, payload),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to execute transactions due to execution by non-owner', async () => {
      await expect(
        reserveFundProxy.connect(alice).executeTransactions([], [], []),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Fail to execute transactions due to empty inputs', async () => {
      await expect(
        reserveFundProxy.executeTransactions([], [], []),
      ).to.be.revertedWith('InvalidInputs');
    });

    it('Fail to execute transactions due to input array length mismatch: _data', async () => {
      await expect(
        reserveFundProxy.executeTransactions(
          [ethers.constants.AddressZero],
          [1],
          [],
        ),
      ).to.be.revertedWith('InvalidInputs');
    });

    it('Fail to execute transactions due to input array length mismatch: _values', async () => {
      const payload = mockLendingMarketController.interface.encodeFunctionData(
        'executeEmergencySettlement',
      );
      await expect(
        reserveFundProxy.executeTransactions(
          [ethers.constants.AddressZero],
          [],
          [payload],
        ),
      ).to.be.revertedWith('InvalidInputs');
    });
  });
});
