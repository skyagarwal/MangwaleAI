#!/bin/bash

# Script to initialize Git repository for Search project
# This script will:
# 1. Initialize git repository
# 2. Add all files (respecting .gitignore)
# 3. Create initial commit
# 4. Provide instructions for pushing to remote

set -e

echo "=========================================="
echo "Git Repository Setup for Search Project"
echo "=========================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Error: Git is not installed. Please install git first."
    exit 1
fi

# Navigate to project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo "📍 Project directory: $PROJECT_DIR"
echo ""

# Check if .git already exists
if [ -d ".git" ]; then
    echo "⚠️  Warning: Git repository already exists!"
    read -p "Do you want to reinitialize? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    echo "Removing existing .git directory..."
    rm -rf .git
fi

# Initialize git repository
echo "🔧 Initializing Git repository..."
git init

# Configure git user (if not already set globally)
if [ -z "$(git config --global user.name)" ]; then
    echo ""
    echo "⚠️  Git user name not configured globally."
    read -p "Enter your name for git commits: " GIT_NAME
    git config user.name "$GIT_NAME"
fi

if [ -z "$(git config --global user.email)" ]; then
    echo ""
    echo "⚠️  Git user email not configured globally."
    read -p "Enter your email for git commits: " GIT_EMAIL
    git config user.email "$GIT_EMAIL"
fi

# Show what will be added
echo ""
echo "📋 Checking files to be added..."
echo ""
git status --short | head -20
TOTAL_FILES=$(git status --short | wc -l)
echo "... (showing first 20 files, total: $TOTAL_FILES files)"
echo ""

# Add all files
echo "➕ Adding all files to git..."
git add .

# Show what was added
echo ""
echo "✅ Files staged for commit:"
git status --short | wc -l
echo ""

# Create initial commit
echo "💾 Creating initial commit..."
COMMIT_MESSAGE="Initial commit: Mangwale Search API with module_id based search

- NestJS search API with OpenSearch integration
- React frontend with Vite
- Module ID based search endpoints (v2)
- Enhanced store and item search with fallback
- Docker Compose setup for production
- Caddy reverse proxy with SSL/TLS
- Semantic search with vector embeddings
- Full-text search with faceting
- Analytics and trending queries
- Natural language search agent"

git commit -m "$COMMIT_MESSAGE"

echo ""
echo "=========================================="
echo "✅ Git repository initialized successfully!"
echo "=========================================="
echo ""
echo "📊 Repository Summary:"
echo "  - Total commits: $(git rev-list --count HEAD)"
echo "  - Branch: $(git branch --show-current)"
echo "  - Latest commit: $(git log -1 --oneline)"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Create a new repository on GitHub/GitLab/Bitbucket:"
echo "   - Go to your Git hosting service"
echo "   - Create a new repository (e.g., 'mangwale-search')"
echo "   - DO NOT initialize with README, .gitignore, or license"
echo ""
echo "2. Add remote and push:"
echo ""
echo "   git remote add origin <YOUR_REPO_URL>"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "   Example:"
echo "   git remote add origin https://github.com/yourusername/mangwale-search.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. (Optional) Verify remote:"
echo "   git remote -v"
echo ""
echo "=========================================="



