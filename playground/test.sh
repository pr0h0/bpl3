#!/bin/bash
# Quick test script for the enhanced playground

echo "======================================"
echo "BPL Playground Enhancement Test"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test health endpoint
echo -e "${BLUE}1. Testing /health endpoint...${NC}"
response=$(curl -s http://localhost:3001/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Health check successful${NC}"
    echo "$response" | jq '.'
else
    echo -e "${YELLOW}⚠ Server not running. Start it from the repository root with: bun run playground${NC}"
    exit 1
fi
echo ""

# Test stats endpoint
echo -e "${BLUE}2. Testing /stats endpoint...${NC}"
stats=$(curl -s http://localhost:3001/stats)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Stats retrieved successfully${NC}"
    echo "$stats" | jq '.'
else
    echo -e "${YELLOW}⚠ Stats endpoint failed${NC}"
fi
echo ""

# Test compilation
echo -e "${BLUE}3. Testing /compile endpoint...${NC}"
compile_result=$(curl -s -X POST http://localhost:3001/compile \
  -H "Content-Type: application/json" \
  -d '{
    "code": "frame main() ret int {\n    return 42;\n}"
  }')
if [ $? -eq 0 ]; then
    success=$(echo "$compile_result" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ Compilation successful${NC}"
        echo "Output:" $(echo "$compile_result" | jq -r '.output')
    else
        echo -e "${YELLOW}⚠ Compilation failed${NC}"
        echo "Error:" $(echo "$compile_result" | jq -r '.error')
    fi
else
    echo -e "${YELLOW}⚠ Compile endpoint failed${NC}"
fi
echo ""

# Test format endpoint
echo -e "${BLUE}4. Testing /format endpoint...${NC}"
format_result=$(curl -s -X POST http://localhost:3001/format \
  -H "Content-Type: application/json" \
  -d '{
    "code": "frame main()ret int{return 0;}"
  }')
if [ $? -eq 0 ]; then
    success=$(echo "$format_result" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ Formatting successful${NC}"
        echo "Formatted code:"
        echo "$format_result" | jq -r '.code'
    else
        echo -e "${YELLOW}⚠ Formatting failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Format endpoint failed${NC}"
fi
echo ""

# Test examples endpoint
echo -e "${BLUE}5. Testing /examples endpoint...${NC}"
examples=$(curl -s http://localhost:3001/examples)
if [ $? -eq 0 ]; then
    count=$(echo "$examples" | jq 'length')
    echo -e "${GREEN}✓ Examples loaded: $count examples${NC}"
    echo "First example:" $(echo "$examples" | jq -r '.[0].title')
else
    echo -e "${YELLOW}⚠ Examples endpoint failed${NC}"
fi
echo ""

# Test logs endpoint
echo -e "${BLUE}6. Testing /logs endpoint...${NC}"
logs=$(curl -s "http://localhost:3001/logs?limit=5")
if [ $? -eq 0 ]; then
    log_count=$(echo "$logs" | jq '.logs | length')
    echo -e "${GREEN}✓ Logs retrieved: $log_count entries${NC}"
    if [ "$log_count" -gt 0 ]; then
        echo "Latest log:" $(echo "$logs" | jq -r '.logs[-1].message')
    fi
else
    echo -e "${YELLOW}⚠ Logs endpoint failed${NC}"
fi
echo ""

# Final stats check
echo -e "${BLUE}7. Final stats check...${NC}"
final_stats=$(curl -s http://localhost:3001/stats)
echo "$final_stats" | jq '{
  totalRequests,
  successfulCompilations,
  failedCompilations,
  averageCompileTime,
  successRate,
  uptime
}'
echo ""

echo "======================================"
echo -e "${GREEN}✓ All tests completed!${NC}"
echo "======================================"
echo ""
echo "Access the playground at: http://localhost:3001"
echo "View server logs in real-time in the terminal where you started the server"
echo ""
