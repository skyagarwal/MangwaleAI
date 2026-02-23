#!/bin/bash

# Script to create GitHub repository and push code
# This script provides step-by-step instructions

set -e

echo "=========================================="
echo "GitHub Repository Setup & Push"
echo "=========================================="
echo ""

cd "$(dirname "$0")"

echo "✅ Current Status:"
echo "  - Remote: $(git remote get-url origin)"
echo "  - Branch: $(git branch --show-current)"
echo "  - Commits ready: $(git log --oneline | wc -l)"
echo ""

echo "📋 STEP 1: Create Repository on GitHub"
echo "=========================================="
echo ""
echo "1. Open your browser and go to:"
echo "   https://github.com/organizations/MangwaleDev/repositories/new"
echo "   OR"
echo "   https://github.com/new (if logged in as MangwaleDev)"
echo ""
echo "2. Fill in the form:"
echo "   - Repository name: mangwale-search"
echo "   - Description: Mangwale Search API with module_id based search"
echo "   - Visibility: Choose Public or Private"
echo ""
echo "3. IMPORTANT: DO NOT check any of these:"
echo "   ❌ Add a README file"
echo "   ❌ Add .gitignore"
echo "   ❌ Choose a license"
echo ""
echo "4. Click 'Create repository'"
echo ""
read -p "Press Enter after you've created the repository on GitHub..."

echo ""
echo "📋 STEP 2: Push to Repository"
echo "=========================================="
echo ""

# Check if repository is accessible
echo "Testing repository access..."
if git ls-remote origin &>/dev/null; then
    echo "✅ Repository is accessible!"
    echo ""
    echo "Pushing code..."
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "=========================================="
        echo "✅ SUCCESS! Code pushed to GitHub!"
        echo "=========================================="
        echo ""
        echo "Repository URL:"
        echo "  https://github.com/MangwaleDev/mangwale-search"
        echo ""
    else
        echo ""
        echo "❌ Push failed. Possible issues:"
        echo "  1. Authentication required"
        echo "  2. Repository doesn't exist yet"
        echo "  3. No access permissions"
        echo ""
        echo "For HTTPS authentication, you'll need a Personal Access Token:"
        echo "  1. Go to: https://github.com/settings/tokens"
        echo "  2. Generate new token (classic)"
        echo "  3. Select 'repo' scope"
        echo "  4. Use token as password when pushing"
        exit 1
    fi
else
    echo "❌ Repository not found or not accessible"
    echo ""
    echo "Possible issues:"
    echo "  1. Repository doesn't exist - Create it first (Step 1)"
    echo "  2. Wrong repository name - Check spelling"
    echo "  3. No access - Ensure you have write access to MangwaleDev org"
    echo "  4. Authentication - Set up SSH keys or use HTTPS with token"
    echo ""
    echo "To use HTTPS instead of SSH:"
    echo "  git remote set-url origin https://github.com/MangwaleDev/mangwale-search.git"
    exit 1
fi



