# =====================================================================
#  Commit del pase de auditoría y rediseño.
#
#  Desde PowerShell, parado en la carpeta del proyecto:
#
#      .\commit-pase2.ps1
#
#  Hace SOLO el commit. No hace push: eso lo decidís vos después de mirar
#  el resultado. La última línea te deja el comando listo.
#
#  Las rutas van explícitas a propósito: la expansión con llaves
#  {07,08,09} es de bash y en PowerShell no existe — habría dejado tres
#  migraciones afuera sin avisar.
# =====================================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
    Write-Host "No estás en la raíz del repositorio." -ForegroundColor Red
    exit 1
}

$rutas = @(
    "src",
    "public/marca",
    "tailwind.config.ts",
    "supabase/migrations/20260916000700_separar_historico_interna.sql",
    "supabase/migrations/20260916000800_indices_busqueda.sql",
    "supabase/migrations/20260916000900_permisos_consulta_y_roles.sql",
    "supabase/migrations/20260916001000_reparar_encoding_catalogos.sql",
    "supabase/tests/04_separacion_historico.sql",
    "supabase/tests/05_encoding.sql",
    "supabase/seed.sql",
    "scripts/import/choferes.py",
    "scripts/test-db.sh",
    "docs/busqueda-y-historico.md"
)

foreach ($r in $rutas) {
    if (Test-Path $r) {
        git add -- $r
    } else {
        Write-Host "  falta (se omite): $r" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Lo que va al commit:" -ForegroundColor Cyan
git diff --cached --stat

Write-Host ""
$resp = Read-Host "Confirmás el commit? (s/N)"
if ($resp -ne "s") {
    Write-Host "Cancelado. Los archivos quedan agregados al índice." -ForegroundColor Yellow
    exit 0
}

git commit -F .commit-mensaje.txt

Write-Host ""
Write-Host "Commit hecho. Para publicarlo:" -ForegroundColor Green
Write-Host "    git push origin main" -ForegroundColor Green
Write-Host ""
Write-Host "Y para limpiar los dos archivos auxiliares:" -ForegroundColor DarkGray
Write-Host "    Remove-Item .commit-mensaje.txt, commit-pase2.ps1" -ForegroundColor DarkGray
