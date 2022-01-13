const CollateralPositionTest = artifacts.require('CollateralPositionTest');

const utils = require('web3-utils');
const { should } = require('chai');
should();

contract('CollateralPositionTest', async (accounts) => {
    const [owner, alice, bob, carol] = accounts;
    let collateralPositionTest;
    const ETH = utils.toBN("1000000000000000000");
    const ZERO_BN = utils.toBN("0");

    let aliceLockedAmt = ZERO_BN;
    let bobLockedAmt = ZERO_BN;
    let carolLockedAmt = ZERO_BN;


    before('deploy CollateralPositionTest', async () => {
        collateralPositionTest = await CollateralPositionTest.new();
    });

    const validatePosition = async (party0, party1, locked0, locked1) => {
        let position = await collateralPositionTest.get(party0, party1);
        position[0].toString().should.be.equal(locked0.toString());
        position[1].toString().should.be.equal(locked1.toString());
    }

    describe('Test deposits and widthdrawals functionality', () => {
        it('Deposit 2 ETH by Alice into position with Bob, check state changes', async () => {
            let depositAmt = ETH.mul(utils.toBN(2));
            aliceLockedAmt = depositAmt;

            await collateralPositionTest.deposit(alice, bob, depositAmt, {from: alice});
            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);
        });

        it('Deposit 5 ETH by Bob into position, check state changes', async () => {
            let depositAmt = ETH.mul(utils.toBN(5));;
            bobLockedAmt = depositAmt;

            await collateralPositionTest.deposit(bob, alice, depositAmt, {from: bob});
            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);
        });

        it('Try to withdraw 5 ETH by Alice, expect withdrawal of previously 2 deposited ETH instead of 5 ETH', async () => {
            let withdrawAmt = ETH.mul(utils.toBN(5));
            aliceLockedAmt = ZERO_BN;

            await collateralPositionTest.withdraw(alice, bob, withdrawAmt, {from: alice});
            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);
        });

        it('Try to deposit 0 ETH by Alice, expect no state change', async () => {
            let depositAmt = ETH.mul(ZERO_BN);
            await collateralPositionTest.deposit(alice, bob, depositAmt, {from: alice});
            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);
        });

        it('Deposit 10 ETH by Carol into position with Alice, validate state changes', async () => {
            let depositAmt = ETH.mul(utils.toBN(10));
            carolLockedAmt = depositAmt;

            await collateralPositionTest.deposit(carol, alice, depositAmt, {from: carol});
            validatePosition(alice, carol, ZERO_BN, carolLockedAmt);
        });
    });

    describe('Test empty position corruption attempts', () => {
        it('Try to withdraw from empty position, expect no state changes', async () => {
            let withdrawAmt = ETH.mul(utils.toBN(100));

            await collateralPositionTest.withdraw(carol, bob, withdrawAmt, {from: carol});
            validatePosition(carol, bob, utils.toBN("0"), utils.toBN("0"));
        });

        it('Try to liquidate from empty position, expect no state changes', async () => {
            let liquidationAmt = ETH.mul(utils.toBN(100));

            await collateralPositionTest.liquidate(carol, bob, liquidationAmt, {from: carol});
            validatePosition(carol, bob, utils.toBN("0"), utils.toBN("0"));
        });

        it('Try to rebalance from empty position, expect no state changes', async () => {
            let rebalanceAmt = ETH.mul(utils.toBN(5));

            await collateralPositionTest.rebalance(carol, bob, alice, rebalanceAmt, {from: carol});
            validatePosition(carol, bob, utils.toBN("0"), utils.toBN("0"));
            validatePosition(carol, alice, carolLockedAmt, utils.toBN("0"));
        });
    });

    describe('Test rebalancing between non-empty positions', () => {
        it('Rebalance by Carol from position with Alice to position with Bob 7 ETH, validate state changes', async () => {
            let rebalanceAmt = ETH.mul(utils.toBN(7));
            carolLockedAmt = carolLockedAmt.sub(rebalanceAmt);

            await collateralPositionTest.rebalance(carol, alice, bob, rebalanceAmt, {from: carol});
            validatePosition(carol, bob, rebalanceAmt, utils.toBN("0"));
            validatePosition(carol, alice, carolLockedAmt, utils.toBN("0"));
        });

        it('Rebalance by Alice from position with Bob to position with Carol 2 ETH, validate state changes', async () => {
            let depositAmt = ETH.mul(utils.toBN(3));
            aliceLockedAmt = depositAmt;
            await collateralPositionTest.deposit(alice, bob, depositAmt, {from: alice});

            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);

            let rebalanceAmt = ETH.mul(utils.toBN(2));
            aliceLockedAmt = aliceLockedAmt.sub(rebalanceAmt);

            await collateralPositionTest.rebalance(alice, bob, carol, rebalanceAmt, {from: alice});
            validatePosition(alice, bob, aliceLockedAmt, bobLockedAmt);
            validatePosition(alice, carol, rebalanceAmt, carolLockedAmt);
        });
    });

    describe('Test liquidations in non-empty positions', () => {
        it('Liquidate 1 ETH from Alice to Carol, check the updated state', async () => {
            let liquidationAmt = ETH;
            carolLockedAmt = carolLockedAmt.add(ETH); // move 1 ETH from Alice to Carol

            await collateralPositionTest.liquidate(alice, carol, liquidationAmt, {from: alice});
            validatePosition(alice, carol, ETH, carolLockedAmt);
        });

        it('Try to Liquidate 30 ETH from Bob to Alice, validate that liquidated only 5 ETH', async () => {
            let liquidationAmt = ETH.mul(utils.toBN(30));;
            bobLockedAmt = ZERO_BN; // expect to get 0 ETH on Bob's side
            aliceLockedAmt = aliceLockedAmt.add(ETH.mul(utils.toBN(5))); // expect to add 5 ETH to Alice side

            await collateralPositionTest.liquidate(bob, alice, liquidationAmt, {from: bob});
            validatePosition(bob, alice, bobLockedAmt, aliceLockedAmt);
        });
    });

    describe('Test clear functionality', () => {
        it('Clear position between Alice and Bob, validate state changes', async () => {
            await collateralPositionTest.clear(alice, bob, {from: alice});
            validatePosition(alice, bob, ZERO_BN, ZERO_BN);
        });

        it('Clear position between Carol and Alice, validate state changes', async () => {
            await collateralPositionTest.clear(carol, alice, {from: carol});
            validatePosition(carol, alice, ZERO_BN, ZERO_BN);
        });
    });

    describe('Calculate gas costs', () => {
        it('Gas costs for getting collateral position', async () => {
            let gasCost = await collateralPositionTest.getGasCostOfGet(alice, bob);
            console.log("Gas cost for getting collateral position between Alice and Bob is " + gasCost.toString() + " gas");

            gasCost = await collateralPositionTest.getGasCostOfGet(bob, alice);
            console.log("Gas cost for getting collateral position between Alice and Bob in reverse counterparties order is " + gasCost.toString() + " gas");
        });
    });
});