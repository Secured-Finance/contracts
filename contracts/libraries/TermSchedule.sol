// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library TermSchedule {
    enum PaymentFrequency {
        ANNUAL,
        SEMI_ANNUAL,
        QUARTERLY,
        MONTHLY,
        FORWARD
    }

    /**
     * @dev Triggers to get payment schedule for supported term according to the payment frequency
     * number of days follows ACT365 market convention
     * @param _numDays Number of days in term
     * @param _frequency Payment frequency (like annual, semi-annual, etc.)
     */
    function getTermSchedule(uint256 _numDays, uint8 _frequency)
        internal
        pure
        returns (uint256[] memory)
    {
        if (PaymentFrequency(_frequency) == PaymentFrequency.ANNUAL) {
            if (_numDays >= 365) {
                uint256 numYears = _numDays / 365;
                uint256[] memory paymentSchedule = new uint256[](numYears);

                for (uint256 i = 0; i < numYears; i++) {
                    uint256 j = i + 1;
                    paymentSchedule[i] = j * 365;
                }

                return paymentSchedule;
            } else if (_numDays > 0) {
                uint256[] memory paymentSchedule = new uint256[](1);
                paymentSchedule[0] = _numDays;

                return paymentSchedule;
            }
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.SEMI_ANNUAL) {
            if (_numDays >= 180) {
                uint256 numHalfYears = _numDays / 180;
                uint256[] memory paymentSchedule = new uint256[](numHalfYears);

                for (uint256 i = 0; i < numHalfYears; i++) {
                    uint256 j = i + 1;
                    paymentSchedule[i] = j * 180;
                }

                return paymentSchedule;
            } else if (_numDays > 0) {
                uint256[] memory paymentSchedule = new uint256[](1);
                paymentSchedule[0] = _numDays;

                return paymentSchedule;
            }
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.QUARTERLY) {
            if (_numDays >= 90) {
                uint256 numQuarters = _numDays / 90;
                uint256[] memory paymentSchedule = new uint256[](numQuarters);

                for (uint256 i = 0; i < numQuarters; i++) {
                    uint256 j = i + 1;
                    paymentSchedule[i] = j * 90;
                }

                return paymentSchedule;
            } else if (_numDays > 0) {
                uint256[] memory paymentSchedule = new uint256[](1);
                paymentSchedule[0] = _numDays;

                return paymentSchedule;
            }
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.MONTHLY) {
            if (_numDays >= 30) {
                uint256 numMonths = _numDays / 30;
                uint256[] memory paymentSchedule = new uint256[](numMonths);

                for (uint256 i = 0; i < numMonths; i++) {
                    uint256 j = i + 1;
                    paymentSchedule[i] = j * 30;
                }

                return paymentSchedule;
            } else if (_numDays > 0) {
                uint256[] memory paymentSchedule = new uint256[](1);
                paymentSchedule[0] = _numDays;

                return paymentSchedule;
            }
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.FORWARD) {
            uint256[] memory paymentSchedule = new uint256[](1);
            paymentSchedule[0] = _numDays;

            return paymentSchedule;
        }
    }

    /**
     * @dev Triggers to get discount factor fractions.
     * @param _numDays Number of days in term
     */
    function getDfFrac(uint256 _numDays) internal pure returns (uint256) {
        if (_numDays >= 365) {
            return 10000;
        } else if (_numDays < 365) {
            uint256 sectors = uint256(360) / _numDays;
            return uint256(10000) / sectors;
        }
    }

    /**
     * @dev Triggers to get number of coupon payments.
     * @param _numDays Number of days in term
     * @param _frequency Payment frequency (like annual, semi-annual, etc.)
     */
    function getNumPayments(uint256 _numDays, uint8 _frequency) internal pure returns (uint256) {
        if (PaymentFrequency(_frequency) == PaymentFrequency.ANNUAL) {
            if (_numDays >= 365) {
                return _numDays / 365;
            } else if (_numDays > 0) {
                return 1;
            } else return 0;
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.SEMI_ANNUAL) {
            if (_numDays >= 365) {
                uint256 _monthConvention = _numDays - (_numDays / 365) * 5;
                return _monthConvention / 180;
            } else if (_numDays >= 180) {
                return _numDays / 180;
            } else if (_numDays > 0) {
                return 1;
            } else return 0;
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.QUARTERLY) {
            if (_numDays >= 365) {
                uint256 _monthConvention = _numDays - (_numDays / 365) * 5;
                return _monthConvention / 90;
            } else if (_numDays >= 90) {
                return _numDays / 90;
            } else if (_numDays > 0) {
                return 1;
            } else return 0;
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.MONTHLY) {
            if (_numDays >= 365) {
                uint256 _monthConvention = _numDays - (_numDays / 365) * 5;
                return _monthConvention / 30;
            } else if (_numDays >= 30) {
                return _numDays / 30;
            } else if (_numDays > 0) {
                return 1;
            } else return 0;
        } else if (PaymentFrequency(_frequency) == PaymentFrequency.FORWARD) {
            return 1;
        } else {
            return 0;
        }
    }
}
