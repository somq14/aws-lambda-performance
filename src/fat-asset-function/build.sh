#!/bin/bash
set -eux
cd $(dirname $0)

head -c 100m /dev/random | base64 | head -c 50m > dat
