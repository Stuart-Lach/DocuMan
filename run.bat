@echo off
title ZIP Heading Editor
python run.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Could not start the application.
    echo Make sure Python 3.9+ is installed and available on your PATH.
    echo Download Python from: https://python.org/downloads/
    pause
)

