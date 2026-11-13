#!/bin/bash
# usage: night.sh <hour-number>   runs 1000 random booking scenarios + the 28 fixed checks, appends to night_log.txt
H=${1:-0}
cd /home/claude/stress
LOG=/home/claude/stress/night_log.txt
echo "=== run for slot $H started $(date -u +%H:%M) UTC, app $(grep -o 'APPV="v[0-9]*"' /mnt/user-data/outputs/proview-bookings.html)" >> $LOG
OFF=$((30000+H*20000)) python3 fuzz500.py 500 /home/claude/stress/night_a.json > night_a.txt 2>&1
OFF=$((40000+H*20000)) python3 fuzz500.py 500 /home/claude/stress/night_b.json > night_b.txt 2>&1
A=$(grep -m1 "^scenarios" night_a.txt); B=$(grep -m1 "^scenarios" night_b.txt)
echo "fuzz A: $A" >> $LOG; echo "fuzz B: $B" >> $LOG
sed -n '/distinct violations/,/--- info/p' night_a.txt night_b.txt | grep -v "^---" >> $LOG
python3 v191.py 2>&1 | grep "^PASSED" | sed 's/^/v191: /' >> $LOG
python3 v192.py 2>&1 | grep "^PASSED" | sed 's/^/v192: /' >> $LOG
echo "=== slot $H finished $(date -u +%H:%M) UTC" >> $LOG
