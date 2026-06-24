# 登录
$loginBody = @{
    username = "root"
    password = "Hsy001120@"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/user/login" -Method POST -ContentType "application/json" -Body $loginBody -SessionVariable session
Write-Host "Login response: $($loginResponse | ConvertTo-Json)"

# 获取模型列表
$modelsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/user/models" -Method GET -WebSession $session
Write-Host "Models response: $($modelsResponse | ConvertTo-Json)"

# 测试图片生成
$imageBody = @{
    model_id = 4
    group = "default"
    prompt = "A beautiful sunset over the ocean"
    n = 1
    size = "1024x1024"
} | ConvertTo-Json

$imageResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/playground/images/generations" -Method POST -ContentType "application/json" -Body $imageBody -WebSession $session
Write-Host "Image response: $($imageResponse | ConvertTo-Json)"