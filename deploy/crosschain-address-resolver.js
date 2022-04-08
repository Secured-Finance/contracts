module.exports = async function ({ deployments }) {
  const collateralAggregator = await deployments.get('CollateralAggregatorV2');
  const ethVault = await deployments.get('CollateralVault');
  const collateralContract = await ethers.getContractAt(
    'CollateralAggregatorV2',
    collateralAggregator.address,
  );

  const crosschainResolverFactory = await ethers.getContractFactory(
    'CrosschainAddressResolver',
  );
  const crosschainResolver = await crosschainResolverFactory.deploy(
    collateralAggregator.address,
  );
  await crosschainResolver.deployed();

  await (
    await collateralContract.setCrosschainAddressResolver(
      crosschainResolver.address,
    )
  ).wait();
  console.log(
    'Deployed CrosschainAddressResolver at ' + crosschainResolver.address,
  );

  const ethVaultContract = await ethers.getContractAt(
    'CollateralVault',
    ethVault.address,
  );

  let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
  let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

  await (
    await collateralContract.functions['register(string[],uint256[])'](
      [btcAddress, filAddress],
      [0, 461],
    )
  ).wait();
  await (
    await ethVaultContract.functions['deposit(uint256)'](
      '1000000000000000000',
      { value: '1000000000000000000' },
    )
  ).wait();
};

module.exports.tags = ['CrossChainAddressResolver'];
module.exports.dependencies = ['CollateralAggregator'];
