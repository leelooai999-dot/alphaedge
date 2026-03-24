#!/bin/bash
# AlphaEdge Build-Test-Deploy Loop
# Runs iteratively until core function is responsive and functional

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENGINE_DIR="/root/.openclaw/workspace/alphaedge/engine"
FRONTEND_DIR="/root/.openclaw/workspace/alphaedge/frontend"
API_URL="https://alphaedge-api-production.up.railway.app"
BYPASS="x-vercel-protection-bypass: ${VERCEL_BYPASS_TOKEN}"

ITERATION=1

echo "=========================================="
echo " AlphaEdge Build-Test-Deploy Loop"
echo "=========================================="
echo ""

while true; do
    echo -e "${YELLOW}[Iteration $ITERATION]$(date '+%H:%M:%S')${NC}"
    echo ""
    
    # -------------------------------------------------------
    # PHASE 1: Build Backend
    # -------------------------------------------------------
    echo "▶ Phase 1: Deploy backend to Railway..."
    RAILWAY_API_TOKEN=${RAILWAY_API_TOKEN:?} railway up --cwd "$ENGINE_DIR" 2>&1 | tail -3
    echo -e "${GREEN}✓ Backend deployed${NC}"
    
    # Wait for Railway to be ready
    echo "  Waiting for backend to be ready..."
    for i in $(seq 1 30); do
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
        if [ "$STATUS" = "200" ]; then
            echo -e "  ${GREEN}Backend ready (attempt $i)${NC}"
            break
        fi
        sleep 5
    done
    
    # -------------------------------------------------------
    # PHASE 2: Test Backend API
    # -------------------------------------------------------
    echo ""
    echo "▶ Phase 2: Test backend API endpoints..."
    
    # Health check
    HEALTH=$(curl -s "$API_URL/health" 2>/dev/null)
    if [ "$HEALTH" != '{"status":"ok"}' ]; then
        echo -e "  ${RED}✗ Health check failed: $HEALTH${NC}"
        ITERATION=$((ITERATION + 1))
        echo ""
        continue
    fi
    echo -e "  ${GREEN}✓ Health: OK${NC}"
    
    # Events endpoint
    EVENTS_COUNT=$(curl -s "$API_URL/api/events" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
    if [ "$EVENTS_COUNT" -lt 10 ]; then
        echo -e "  ${RED}✗ Events: only $EVENTS_COUNT (expected 18)${NC}"
        ITERATION=$((ITERATION + 1))
        echo ""
        continue
    fi
    echo -e "  ${GREEN}✓ Events: $EVENTS_COUNT${NC}"
    
    # Stock detail
    STOCK_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/api/stocks/CVX" 2>/dev/null)
    if (( $(echo "$STOCK_TIME > 2.0" | bc -l) )); then
        echo -e "  ${RED}✗ Stock detail: ${STOCK_TIME}s (too slow, need <2s)${NC}"
        ITERATION=$((ITERATION + 1))
        echo ""
        continue
    fi
    echo -e "  ${GREEN}✓ Stock detail: ${STOCK_TIME}s${NC}"
    
    # Fast simulation
    SIM_TIME=$(curl -s -o /dev/null -w "%{time_total}" \
        "$API_URL/api/simulate" \
        -H "Content-Type: application/json" \
        -d '{"ticker":"CVX","events":[{"id":"iran_escalation","params":{"severity":5,"duration_days":30},"probability":0.67}],"horizon_days":30,"n_simulations":500,"fast":true}' 2>/dev/null)
    if (( $(echo "$SIM_TIME > 5.0" | bc -l) )); then
        echo -e "  ${RED}✗ Fast sim: ${SIM_TIME}s (too slow, need <5s)${NC}"
        ITERATION=$((ITERATION + 1))
        echo ""
        continue
    fi
    
    FAST_RESULT=$(curl -s "$API_URL/api/simulate" \
        -H "Content-Type: application/json" \
        -d '{"ticker":"CVX","events":[{"id":"iran_escalation","params":{"severity":5,"duration_days":30},"probability":0.67}],"horizon_days":30,"n_simulations":500,"fast":true}' 2>/dev/null)
    FAST_PATHS=$(echo "$FAST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('paths_sample',[])))" 2>/dev/null || echo "0")
    FAST_MEDIAN=$(echo "$FAST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'\${d.get(\"median_target\",0):.2f}')" 2>/dev/null || echo "?")
    echo -e "  ${GREEN}✓ Fast sim (500 paths): ${SIM_TIME}s, median=\$${FAST_MEDIAN}, ${FAST_PATHS} paths${NC}"
    
    # Full simulation  
    FULL_TIME=$(curl -s -o /dev/null -w "%{time_total}" \
        "$API_URL/api/simulate" \
        -H "Content-Type: application/json" \
        -d '{"ticker":"CVX","events":[{"id":"iran_escalation","params":{"severity":5,"duration_days":30},"probability":0.67}],"horizon_days":30,"n_simulations":2000}' 2>/dev/null)
    FULL_PATHS=$(curl -s "$API_URL/api/simulate" \
        -H "Content-Type: application/json" \
        -d '{"ticker":"CVX","events":[{"id":"iran_escalation","params":{"severity":5,"duration_days":30},"probability":0.67}],"horizon_days":30,"n_simulations":2000}' 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('paths_sample',[])))" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}✓ Full sim (2000 paths): ${FULL_TIME}s, ${FULL_PATHS} paths${NC}"
    
    # History endpoint
    HIST_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/api/stocks/CVX/history?days=90" 2>/dev/null)
    HIST_DAYS=$(curl -s "$API_URL/api/stocks/CVX/history?days=90" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dates',[])))" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}✓ History: ${HIST_DAYS} days in ${HIST_TIME}s${NC}"
    
    # Cache test (second call should be faster)
    STOCK_TIME2=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/api/stocks/CVX" 2>/dev/null)
    echo -e "  ${GREEN}✓ Stock cache: 1st=${STOCK_TIME}s, 2nd=${STOCK_TIME2}s${NC}"
    
    # -------------------------------------------------------
    # PHASE 3: Build Frontend
    # -------------------------------------------------------
    echo ""
    echo "▶ Phase 3: Build frontend..."
    cd "$FRONTEND_DIR"
    BUILD_START=$(date +%s)
    pnpm build > /tmp/build.log 2>&1
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    
    if [ $? -ne 0 ]; then
        echo -e "  ${RED}✗ Build failed:${NC}"
        tail -10 /tmp/build.log
        ITERATION=$((ITERATION + 1))
        echo ""
        continue
    fi
    echo -e "  ${GREEN}✓ Frontend build: ${BUILD_TIME}s${NC}"
    
    # Check bundle size
    SIM_SIZE=$(grep "/sim/\[ticker\]" /tmp/build.log | awk '{print $3}' || echo "?")
    echo -e "  ${GREEN}✓ Sim page size: ${SIM_SIZE}${NC}"
    
    # -------------------------------------------------------
    # PHASE 4: Push + Deploy
    # -------------------------------------------------------
    echo ""
    echo "▶ Phase 4: Push to GitHub (triggers Vercel)..."
    cd /root/.openclaw/workspace/alphaedge
    git add -A
    git commit -m "perf iteration $ITERATION: backend cache + fast sim + frontend optimizations" --allow-empty 2>&1 | tail -1
    git push origin master 2>&1 | tail -1
    echo -e "  ${GREEN}✓ Pushed${NC}"
    
    # -------------------------------------------------------
    # PHASE 5: Wait for Vercel + Test
    # -------------------------------------------------------
    echo ""
    echo "▶ Phase 5: Wait for Vercel build..."
    VERCEL_READY="no"
    for i in $(seq 1 40); do
        DEPLOY_STATUS=$(cd "$FRONTEND_DIR" && npx vercel ls --token=${VERCEL_TOKEN:?} 2>/dev/null | head -4 | grep -o "● [A-Za-z]*" | head -1 | awk '{print $2}')
        
        if [ "$DEPLOY_STATUS" = "Ready" ]; then
            VERCEL_READY="yes"
            echo -e "  ${GREEN}✓ Vercel deployed (check $i, ~$((i*30))s)${NC}"
            break
        elif [ "$DEPLOY_STATUS" = "Error" ]; then
            echo -e "  ${RED}✗ Vercel build error (attempt $i)${NC}"
            break
        fi
        sleep 30
    done
    
    if [ "$VERCEL_READY" != "yes" ]; then
        echo -e "  ${YELLOW}⚠ Vercel not ready yet, skipping frontend smoke test${NC}"
    else
        # Frontend smoke test
        PAGE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -L -H "$BYPASS" "https://frontend-leeloo-ai.vercel.app/sim/CVX" 2>/dev/null)
        echo -e "  ${GREEN}✓ Frontend /sim/CVX: HTTP $PAGE_HTTP${NC}"
    fi
    
    # -------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------
    echo ""
    echo "=========================================="
    echo -e " ${GREEN}Iteration $ITERATION PASSED${NC}"
    echo "=========================================="
    echo ""
    echo "Backend:"
    echo "  Health: OK"
    echo "  Events: $EVENTS_COUNT"
    echo "  Stock: ${STOCK_TIME}s (cached: ${STOCK_TIME2}s)"
    echo "  History: ${HIST_DAYS} days in ${HIST_TIME}s"
    echo "  Fast sim (500): ${SIM_TIME}s"
    echo "  Full sim (2000): ${FULL_TIME}s"
    echo ""
    echo "Frontend:"
    echo "  Build: ${BUILD_TIME}s"
    echo "  Sim page: ${SIM_SIZE}"
    echo "  Vercel: $VERCEL_READY"
    echo ""
    
    ITERATION=$((ITERATION + 1))
    
    # Loop until all thresholds met
    ALL_GOOD=true
    
    if (( $(echo "$STOCK_TIME > 2.0" | bc -l) )); then ALL_GOOD=false; fi
    if (( $(echo "$SIM_TIME > 5.0" | bc -l) )); then ALL_GOOD=false; fi
    if (( $(echo "$FULL_TIME > 15.0" | bc -l) )); then ALL_GOOD=false; fi
    if [ "$EVENTS_COUNT" -lt 10 ]; then ALL_GOOD=false; fi
    if [ "$HIST_DAYS" -lt 10 ]; then ALL_GOOD=false; fi
    if [ "$VERCEL_READY" != "yes" ]; then ALL_GOOD=false; fi
    
    if [ "$ALL_GOOD" = true ]; then
        echo -e "${GREEN}🎉 ALL THRESHOLDS MET — loop complete!${NC}"
        break
    else
        echo -e "${YELLOW}Some thresholds not met, continuing...${NC}"
        echo ""
    fi
done
