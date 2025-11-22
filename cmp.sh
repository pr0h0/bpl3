#!/bin/bash

fileName="${1%%.*}" # remove .s extension
outputFile="$(basename "$1" .x)"

echo "Compiling and running TypeScript file: $1"
bun index.ts $1 1>/dev/null
echo;

echo "Assembling and linking assembly file: ${fileName}.asm"
nasm -f elf64 ${fileName}".asm"
# if there was an error during assembly, exit the script
if [ $? -ne 0 ]; then
    echo "Assembly failed. Exiting."
    exit 1
fi

echo "Linking object file: ${fileName}.o to create executable: ${outputFile}"
ld "${fileName}.o" -o ${outputFile} -lc --dynamic-linker /lib64/ld-linux-x86-64.so.2
# if there was an error during linking, exit the script
if [ $? -ne 0 ]; then
    echo "Linking failed. Exiting."
    exit 1
fi
rm "${fileName}.o"


echo "Running the output file: ${outputFile}"
echo "-----------------------------------";
[ "$2" == "-g" ] && gdb -q ${outputFile};
[ "$2" == "-g" ] || (./${outputFile}; echo "Exit code: $?");
echo "-----------------------------------";
