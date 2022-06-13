require('dotenv/config');
const { hexFILString, toBytes32 } = require('../test-utils').strings;
const { fromWeiToEther } = require('../test-utils').numbers;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get contracts
  const addressResolver = await deployments.get('AddressResolver');
  const oracle = await deployments
    .get('Operator')
    .then(({ address }) => ethers.getContractAt('Operator', address));
  const proxyController = await deployments
    .get('ProxyController')
    .then(({ address }) => ethers.getContractAt('ProxyController', address));
  const settlementEngine = await proxyController
    .getProxyAddress(toBytes32('SettlementEngine'))
    .then((address) => ethers.getContractAt('SettlementEngine', address));

  // Deploy contracts
  const linkTokenAddress = await oracle.getChainlinkToken();
  const settlementAdapter = await deploy('ChainlinkSettlementAdapter', {
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
  console.log(
    'Deployed ChainlinkSettlementAdapter at ' + settlementAdapter.address,
  );

  // Set up for ChainlinkSettlementAdapter
  const linkContract = await ethers.getContractAt(
    'LinkToken',
    linkTokenAddress,
  );
  const depositAmount = process.env.CHAINLINK_LINK_DEPOSIT || 0;
  if (depositAmount > 0) {
    await linkContract
      .transfer(settlementAdapter.address, depositAmount)
      .then((tx) => tx.wait());
  }
  console.log(
    `Sent ${fromWeiToEther(depositAmount)} LINK to ` +
      settlementAdapter.address,
  );

  await settlementEngine
    .addExternalAdapter(settlementAdapter.address, hexFILString)
    .then((tx) => tx.wait());
};

module.exports.tags = ['ChainlinkSettlementAdapter'];
module.exports.dependencies = [
  'AddressResolver',
  'ChainlinkOracle',
  'Migration',
];
