npm run package
git add .
git commit -m "re-tagging"
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
git tag -a v1.0.0 -m "Version 1.0.0"
git push origin main --tags