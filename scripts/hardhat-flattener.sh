#!/usr/bin/env bash

CONTRACTS_FOLDER=tmp
FLATTENED_FOLDER=flattened

mkdir -p $FLATTENED_FOLDER
rm -rf $FLATTENED_FOLDER/*

rm -rf tmp
cp -R contracts tmp

# Replace a short file name with its full name. hardhat flatten doen't support 'import AAA as BBB' notation as of Apr 2023.
find $CONTRACTS_FOLDER \( -path 'tmp/mocks' -prune \) -o -name '*.sol' -print | while IFS=$'\n' read -r FILE; do
  # Note: hardhat flatten doens't support 'import YYY as XXX' syntax yet. Replace XXX with YYY before flattening them.
  # Extract the import line containing 'as XXXXX'.
  import_storage=$(grep "as Storage" "$FILE")
  import_params=$(grep "as Params" "$FILE")
  import_timelibrary=$(grep "as TimeLibrary" "$FILE")

  # Extract the variable name before 'as XXXXX'.
  import_storage=$(echo "$import_storage" | grep -oE '{[^}]*}' | sed -E 's/.*{(.*)( as Storage)(.*)/\1/')
  import_params=$(echo "$import_params" | grep -oE '{[^}]*}' | sed -E 's/.*{(.*)( as Params)(.*)/\1/')
  import_timelibrary=$(echo "$import_timelibrary" | grep -oE '{[^}]*}' | sed -E 's/.*{(.*)( as TimeLibrary)(.*)/\1/')

  if [ "$import_storage" ]; then 
    #Might not be efficient. Fix me later. So far, SF contracts the four patterns of 'Storage' to be replaced.
    sed -i '' -e "s/Storage.slot/${import_storage}.slot/g" -e "s/^Storage$/${import_storage}/g" -e "s/ Storage/ ${import_storage}/g" -e "s/!Storage/!${import_storage}/g" "$FILE"
  fi

  if [ "$import_params" ]; then 
    sed -i '' -e "s/ Params\./ ${import_params}./g" -e "s/[(]Params\./(${import_params}./g" "$FILE"
  fi

  if [ "$import_timelibrary" ]; then 
    sed -i '' -e "s/ TimeLibrary\./ ${import_timelibrary}./g" "$FILE"
  fi
done

# Exclude sol files that are referenced by other sol files because those referenced files will be flattened into caller sol files.
find $CONTRACTS_FOLDER \( -path 'tmp/liquidators/interfaces' -prune -o -path 'tmp/mocks' -prune -o -path 'tmp/protocol/interfaces' -prune -o -path 'tmp/protocol/libraries' -prune -o -path 'tmp/protocol/storages' -prune -o -path 'tmp/protocol/types' -prune -o -path 'tmp/protocol/utils' -prune \) -o -name '*.sol' -print | while IFS=$'\n' read -r FILE; do
  FLATTENED_FILE=$FLATTENED_FOLDER/`basename $FILE`
  printf "Processing $FILE into $FLATTENED_FILE\n"

  npx hardhat flatten $FILE >> $FLATTENED_FILE  || echo "error processing: $FILE"
  # Note: hardhat flatten doens't delete license identifier and pragma abicoder statement. Delete them all.
  sed -i '' -e '/\/\/ SPDX-License-Identifier.*/d' "$FLATTENED_FILE"
  sed -i '' -e '/pragma abicoder/d' "$FLATTENED_FILE"
done

rm -rf tmp

printf "\e[32m✔ Contracts flattened in folder $FLATTENED_FOLDER.\e[0m\n"