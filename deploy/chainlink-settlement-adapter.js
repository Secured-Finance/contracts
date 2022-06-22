require('dotenv/config');
const { hexFILString, toBytes32 } = require('../test-utils').strings;
const { fromWeiToEther } = require('../test-utils').numbers;
const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get contracts
  const oracle = await deployments
    .get('Operator')
    .then(({ address }) => ethers.getContractAt('Operator', address));
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const addressResolver = await proxyController
    .getAddressResolverProxyAddress()
    .then((address) => ethers.getContractAt('AddressResolver', address));
  const settlementEngine = await proxyController
    .getProxyAddress(toBytes32('SettlementEngine'))
    .then((address) => ethers.getContractAt('SettlementEngine', address));

  // Deploy contracts
  const linkTokenAddress = await oracle.getChainlinkToken();
  const deployResult = await deploy('ChainlinkSettlementAdapter', {
    from: deployer,
    args: [
      addressResolver.address,
      oracle.address,
      process.env.CHAINLINK_JOB_ID,
      process.env.CHAINLINK_REQUEST_FEE,
      linkTokenAddress,
      hexFILString,
    ],
  });

  await executeIfNewlyDeployment(
    'ChainlinkSettlementAdapter',
    deployResult,
    async () =>
      settlementEngine
        .addExternalAdapter(deployResult.address, hexFILString)
        .then((tx) => tx.wait()),
  );

  // Set up for ChainlinkSettlementAdapter
  const isInitialDeployment = await deployments
    .getOrNull('ChainlinkSettlementAdapter')
    .then((contract) => !contract);

  if (isInitialDeployment) {
    const linkContract = await ethers.getContractAt(
      'LinkToken',
      linkTokenAddress,
    );
    const depositAmount = process.env.CHAINLINK_LINK_DEPOSIT || 0;
    if (depositAmount > 0) {
      await linkContract
        .transfer(deployResult.address, depositAmount)
        .then((tx) => tx.wait());
    }
    console.log(
      `Sent ${fromWeiToEther(depositAmount)} LINK to ` + deployResult.address,
    );
  } else {
    console.warn('Skipped Link token transfer');
  }

  // if (settlementAdapter.newlyDeployed) {
  //   await settlementEngine
  //     .addExternalAdapter(settlementAdapter.address, hexFILString)
  //     .then((tx) => tx.wait());
  // } else {
  //   console.warn('Skipped adding ExternalAdapter');
  // }
};

module.exports.tags = ['ChainlinkSettlementAdapter'];
module.exports.dependencies = [
  'AddressResolver',
  'ChainlinkOracle',
  'Migration',
];
