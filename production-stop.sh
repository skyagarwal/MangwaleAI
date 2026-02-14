#!/bin/bash
# Mangwale AI - Production Stop Script
# Date: January 5, 2026

echo "🛑 Stopping Mangwale AI Production Environment"
echo "=============================================="
echo ""

# Stop backend services
echo "Stopping Backend Stack..."
cd /home/ubuntu/Devs/MangwaleAI/backend
docker-compose down
echo "✅ Backend stopped"
echo ""

# Stop frontend
echo "Stopping Frontend..."
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose down
echo "✅ Frontend stopped"
echo ""

# Stop monitoring
echo "Stopping Monitoring Stack..."
cd /home/ubuntu/Devs/MangwaleAI
docker-compose -f docker-compose.monitoring.yml down
echo "✅ Monitoring stopped"
echo ""

# Kill any remaining processes
pkill -f "nest start" 2>/dev/null || true
pkill -f "node.*3200" 2>/dev/null || true
pkill -f "node.*3005" 2>/dev/null || true

echo "=============================================="
echo "🎉 All services stopped successfully!"
echo "=============================================="
