#!/bin/sh
# Backup diário do banco do PersonaFlow: pg_dump no formato custom, conferido antes de guardar.
# Não lê nem imprime credencial: o pg_dump roda dentro do contêiner, com as variáveis dele.
# A cópia fora da VPS é puxada pelo PC (deploy/puxar-backup.ps1).
set -eu
umask 077

DESTINO="${PERSONAFLOW_BACKUP_DIR:-$HOME/backups/personaflow}"
MANTER="${PERSONAFLOW_BACKUP_MANTER:-14}"
CONTAINER="${PERSONAFLOW_PG_CONTAINER:-personaflow-postgres}"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
NOME="personaflow-$(date -u +%Y-%m-%dT%H%MZ).dump"
PARCIAL="$DESTINO/.$NOME.parcial"
trap 'rm -f "$PARCIAL"' EXIT

docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$PARCIAL"

# O arquivo tem que abrir: pg_restore --list lê o índice inteiro e conta as tabelas com dados.
TABELAS=$(docker exec -i "$CONTAINER" pg_restore --list < "$PARCIAL" | grep -c ' TABLE DATA ' || true)
if [ "$TABELAS" -eq 0 ]; then
  echo "backup sem dados de tabela; nada guardado" >&2
  exit 1
fi

mv "$PARCIAL" "$DESTINO/$NOME"
(cd "$DESTINO" && sha256sum "$NOME" > "$NOME.sha256")

# Retenção: os $MANTER mais novos ficam na VPS (o nome tem a data, então a ordem é a do nome).
ls -1 "$DESTINO"/personaflow-*.dump | sort -r | tail -n +"$((MANTER + 1))" | while read -r velho; do
  rm -f -- "$velho" "$velho.sha256"
done

printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NOME" "$TABELAS" > "$DESTINO/ultimo-ok"
echo "ok: $NOME ($TABELAS tabelas com dados)"
