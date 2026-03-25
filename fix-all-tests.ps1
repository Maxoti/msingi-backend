# Fix all test files
Write-Host "🔧 Fixing all test files..." -ForegroundColor Cyan

$fixedFiles = 0

Get-ChildItem -Path .\tests -Recurse -Filter *.test.js | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw
    $modified = $false
    
    # Fix 1: User INSERT with variable name instead of $1
    if ($content -match "VALUES \('(\w+)', '\1@test\.com', \1,") {
        $content = $content -replace "VALUES \('(\w+)', '\1@test\.com', \1,", "VALUES ('`$1', '`$1@test.com', `$1,"
        $modified = $true
        Write-Host "  ✓ Fixed user INSERT: $($_.Name)" -ForegroundColor Yellow
    }
    
    # Fix 2: EventBus path (wrong depth)
    if ($content -match "require\('\.\.\/\.\.\/src\/shared\/events\/eventBus'\)") {
        $content = $content -replace "require\('\.\.\/\.\.\/src\/shared\/events\/eventBus'\)", "require('../../../src/shared/events/eventBus')"
        $modified = $true
        Write-Host "  ✓ Fixed eventBus path: $($_.Name)" -ForegroundColor Yellow
    }
    
    # Fix 3: grade_level with string values (should be integers)
    if ($content -match "grade_level, capacity\)\s+VALUES") {
        $content = $content -replace "VALUES \('([^']+)', 'SECONDARY',", "VALUES ('`$1', 9,"
        $content = $content -replace "VALUES \('([^']+)', 'PRIMARY',", "VALUES ('`$1', 1,"
        $modified = $true
        Write-Host "  ✓ Fixed grade_level to integer: $($_.Name)" -ForegroundColor Yellow
    }
    
    # Fix 4: Exam 'title' column (should be 'name')
    if ($content -match "WHERE title") {
        $content = $content -replace "WHERE title", "WHERE name"
        $modified = $true
        Write-Host "  ✓ Fixed exam title→name: $($_.Name)" -ForegroundColor Yellow
    }
    
    if ($modified) {
        Set-Content -Path $file -Value $content -NoNewline
        $fixedFiles++
        Write-Host "✅ Saved: $($_.Name)`n" -ForegroundColor Green
    }
}

Write-Host "`n🎉 Fixed $fixedFiles test files!" -ForegroundColor Green
Write-Host "Run 'npm test' to verify" -ForegroundColor Cyan
