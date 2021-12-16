// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

library QuickSort {
    
    function sort(uint256[] memory data) public pure returns (uint256[] memory) {
       quickSort(data, int(0), int(data.length - 1));
       return data;
    }
    
    function quickSort(uint256[] memory arr, int left, int right) internal pure {
        int i = left;
        int j = right;
        if(i==j) return;
        uint pivot = arr[uint(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint(i)] < pivot) i++;
            while (pivot < arr[uint(j)]) j--;
            if (i <= j) {
                (arr[uint(i)], arr[uint(j)]) = (arr[uint(j)], arr[uint(i)]);
                i++;
                j--;
            }
        }
        if (left < j)
            quickSort(arr, left, j);
        if (i < right)
            quickSort(arr, i, right);
    }
}