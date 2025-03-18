@echo off
echo Clearing browser cache and starting server...
start http://localhost:8888/?clear_cache=true
npm run clean-start
