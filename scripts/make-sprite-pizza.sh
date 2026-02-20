#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}==>${NC} ${BOLD}$*${NC}"; }
ok()      { echo -e "${GREEN} ok${NC} $*"; }
warn()    { echo -e "${YELLOW} !!${NC} $*"; }
err()     { echo -e "${RED} !!${NC} $*" >&2; }
die()     { err "$@"; exit 1; }
section() { echo ""; info "$@"; }

ADJECTIVES=(swift bright calm cool dark fast keen pale warm wild bold crisp deep fair free gold iron jade lime mint nova pure rare sage slim teal void wise zinc)
NOUNS=(arch beam bolt cell core dart edge flux gate hive iris knot lens mast node opus pine quad rift slab tide unit vale warp xray yew zone)

generate_name() {
    local adj=${ADJECTIVES[$RANDOM % ${#ADJECTIVES[@]}]}
    local noun=${NOUNS[$RANDOM % ${#NOUNS[@]}]}
    echo "pizza-${adj}-${noun}"
}

run_on_sprite() {
    sprite exec -s "$SPRITE_NAME" -- "$@"
}

CREATED_SPRITE=""
cleanup() {
    if [[ -n "$CREATED_SPRITE" ]]; then
        echo ""
        err "Setup failed -- destroying sprite '${CREATED_SPRITE}'"
        sprite destroy -force "$CREATED_SPRITE" 2>/dev/null || true
    fi
}
trap cleanup EXIT

SPRITE_NAME=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --name) SPRITE_NAME="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: make-sprite-pizza.sh [--name <sprite-name>]"
            echo ""
            echo "Creates and configures a Sprite VM for Pi development."
            echo "Installs Tailscale, authenticates services, clones the project,"
            echo "and starts the dev server -- accessible only via your tailnet."
            echo ""
            echo "If --name is not provided, a random name is generated."
            exit 0
            ;;
        *) die "Unknown argument: $1" ;;
    esac
done

if [[ -z "$SPRITE_NAME" ]]; then
    SPRITE_NAME=$(generate_name)
fi

REPO_URL="https://github.com/williballenthin/pizza.git"
DEV_PORT=5173

section "Checking prerequisites"
command -v sprite >/dev/null 2>&1 || die "sprite CLI not found. Install: curl -fsSL https://sprites.dev/install.sh | sh"
ok "sprite CLI found"

# ── Pre-flight: detect what we already have ──────────────────────
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BOLD}make-sprite-pizza${NC} -- provision a Pi dev environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Sprite name: ${BOLD}${SPRITE_NAME}${NC}"
echo ""
echo "  This script will:"
echo "    1. Create a Sprite VM"
echo "    2. Install Tailscale and join your tailnet"
echo "    3. Install pi CLI"
echo "    4. Authenticate to GitHub (interactive SSH + OAuth)"
echo "    5. Authenticate pi providers via /login (e.g. openai-codex)"
echo "    6. Clone williballenthin/pizza and start the dev server"
echo "    7. Expose the dev server via Tailscale (tailnet-only, not public)"
echo ""
echo "  You will need:"
echo -e "    - ${BOLD}Tailscale auth key${NC} (reusable)"
echo "      Generate at: https://login.tailscale.com/admin/settings/keys"
if [[ -n "$OPENROUTER_API_KEY" ]]; then
echo -e "    - ${BOLD}OpenRouter API key${NC}  ${GREEN}found in environment${NC}"
else
echo -e "    - ${BOLD}OpenRouter API key${NC}"
echo "      Get one at: https://openrouter.ai/keys"
fi
echo "    - A browser for GitHub OAuth"
echo "    - A browser for pi provider OAuth (e.g. openai-codex /login)"
echo ""
read -rp "  Ready to proceed? [Y/n] " CONFIRM
CONFIRM="${CONFIRM:-Y}"
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Collect credentials ──────────────────────────────────────────
section "Credentials"

echo ""
read -rsp "  Tailscale auth key: " TAILSCALE_AUTH_KEY
echo ""
[[ -n "$TAILSCALE_AUTH_KEY" ]] || die "Tailscale auth key is required"

if [[ -z "$OPENROUTER_API_KEY" ]]; then
    echo ""
    read -rsp "  OpenRouter API key: " OPENROUTER_API_KEY
    echo ""
    [[ -n "$OPENROUTER_API_KEY" ]] || die "OpenRouter API key is required"
else
    ok "Using OpenRouter API key from environment"
fi


# ── Create Sprite ────────────────────────────────────────────────
section "Creating sprite"
if sprite list 2>/dev/null | grep -q "$SPRITE_NAME"; then
    warn "Sprite '${SPRITE_NAME}' already exists, reusing"
    CREATED_SPRITE="$SPRITE_NAME"
else
    sprite create -skip-console "$SPRITE_NAME"
    CREATED_SPRITE="$SPRITE_NAME"
    ok "Created ${SPRITE_NAME}"
fi


# ── Install Tailscale ────────────────────────────────────────────
section "Installing Tailscale"
run_on_sprite bash -c '
    if command -v tailscale &>/dev/null; then
        echo "Tailscale already installed"
    else
        curl -fsSL https://tailscale.com/install.sh | sh
    fi
'
ok "Tailscale installed"


# ── Install Node packages ───────────────────────────────────────
# (gh is pre-installed on sprites)
section "Installing pi"
run_on_sprite bash -c '
    npm install -g @mariozechner/pi-coding-agent 2>&1 | tail -5
    NODE_BIN=$(/.sprite/bin/node -e "console.log(process.execPath)" | xargs dirname)
    ln -sf "$NODE_BIN/pi" /home/sprite/.local/bin/pi
    pi --version
'
ok "pi installed"


# ── Configure Tailscale ─────────────────────────────────────────
# Sprite quirks for Tailscale:
#   - tailscaled runs as user "sprite" via the sprite service manager, so it
#     cannot manage iptables rules. Use --netfilter-mode=off to avoid stale
#     DROP rules that block inbound Tailscale traffic.
#   - /etc/resolv.conf is read-only in sprite VMs. Use --accept-dns=false
#     to skip the DNS config step that would otherwise fail on every start.
#   - Set --operator=sprite so that `tailscale serve` works without sudo
#     (critical for the netstack handler to register correctly).
section "Configuring Tailscale"
run_on_sprite bash -c '
    if sprite-env curl /v1/services 2>/dev/null | grep -q "\"tailscaled\""; then
        echo "tailscaled service already running"
    else
        echo "Starting tailscaled service..."
        sprite-env curl -X PUT "/v1/services/tailscaled?duration=3s" -d "{
            \"cmd\": \"tailscaled\",
            \"args\": [\"--state=/var/lib/tailscale/tailscaled.state\", \"--socket=/var/run/tailscale/tailscaled.sock\"]
        }"
        sleep 3
    fi
'

run_on_sprite bash -c "
    if tailscale status &>/dev/null; then
        echo 'Tailscale already connected'
    else
        echo 'Authenticating...'
        sudo tailscale up --authkey='${TAILSCALE_AUTH_KEY}' --accept-dns=false --netfilter-mode=off --hostname='${SPRITE_NAME}'
    fi
    sudo tailscale set --hostname='${SPRITE_NAME}' --operator=sprite
    echo \"Tailscale IP: \$(tailscale ip -4 2>/dev/null)\"
"
ok "Tailscale configured (tailnet-only, no public URL)"


# ── Environment Variables ────────────────────────────────────────
section "Configuring environment"
sprite exec -s "$SPRITE_NAME" -env "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" -- bash -c '
    echo "export OPENROUTER_API_KEY=\"${OPENROUTER_API_KEY}\"" > ~/.pi-env
    chmod 600 ~/.pi-env

    if ! grep -q "pi-env" ~/.bashrc 2>/dev/null; then
        echo "[ -f ~/.pi-env ] && source ~/.pi-env" >> ~/.bashrc
    fi
'
ok "OpenRouter API key saved to ~/.pi-env"


# ── GitHub Authentication ────────────────────────────────────────
section "GitHub authentication"
echo -e "  Sprite name: ${BOLD}${SPRITE_NAME}${NC}  (use as SSH key title)"
echo ""
sprite exec -s "$SPRITE_NAME" -tty -- gh auth login --hostname github.com --git-protocol ssh --web
run_on_sprite gh auth status &>/dev/null 2>&1 || die "GitHub authentication failed"
ok "GitHub authenticated"


# ── Pi Provider Authentication ──────────────────────────────────
section "Pi provider authentication (e.g. openai-codex)"
echo "  Pi will open interactively. Type /login to authenticate providers."
echo "  When done, exit pi with Ctrl+C."
echo ""
# pi's TUI exits with 130 on Ctrl+C, which is the expected way to quit
sprite exec -s "$SPRITE_NAME" -env "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" -tty -- pi || true
ok "Pi login complete"


# ── Clone Project ────────────────────────────────────────────────
section "Cloning project"
run_on_sprite bash -c '
    mkdir -p ~/.ssh
    ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
    cd ~
    if [ -d pizza/.git ]; then
        echo "Project exists, pulling latest..."
        cd pizza && git pull
    else
        echo "Cloning..."
        rm -rf pizza
        gh repo clone williballenthin/pizza ~/pizza
    fi
'
ok "Project cloned"

run_on_sprite bash -c '
    mkdir -p ~/.pi/agent/sessions/--home-sprite--
    mkdir -p ~/.pi/agent/sessions/--home-sprite-pizza--
'
ok "Pi session directories created"


# ── Install Dependencies ────────────────────────────────────────
section "Installing project dependencies"
run_on_sprite bash -c '
    cd ~/pizza && npm install 2>&1 | tail -5
'
ok "npm install complete"


# ── Start Dev Server ────────────────────────────────────────────
section "Starting dev server"
sprite exec -s "$SPRITE_NAME" -env "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" -- bash -c '
    cat > ~/start-pi-dev.sh << SCRIPT_EOF
#!/usr/bin/env bash
source ~/.pi-env 2>/dev/null
cd ~/pizza
exec npm run dev
SCRIPT_EOF
    chmod +x ~/start-pi-dev.sh

    sprite-env curl -X DELETE "/v1/services/pi-dev" 2>/dev/null || true
    sleep 1

    sprite-env curl -X PUT "/v1/services/pi-dev?duration=3s" -d "{
        \"cmd\": \"/home/sprite/start-pi-dev.sh\"
    }"
'
sleep 3
ok "Dev server registered as sprite service (auto-restarts on wake)"


# ── Tailscale Serve ──────────────────────────────────────────────
# The tailscale serve handler can fail to register in the userspace netstack
# if it was configured before tailscaled fully initialized. Reset it first
# to ensure the TCP handler is properly bound. Without this, inbound
# connections to :443 get "connection was refused" even though the config
# looks correct.
section "Exposing dev server via Tailscale"
run_on_sprite bash -c "
    tailscale serve --bg off 2>/dev/null || true
    sleep 1
    tailscale serve --bg ${DEV_PORT}
    tailscale serve status
"

TAILSCALE_URL=$(run_on_sprite bash -c 'tailscale serve status 2>/dev/null | grep -oE "https://[^ ]+" | head -1' 2>/dev/null || echo "")
TAILSCALE_IP=$(run_on_sprite bash -c 'tailscale ip -4 2>/dev/null' 2>/dev/null || echo "unknown")

ok "Dev server exposed on tailnet"


# ── Verify Tailscale connectivity ───────────────────────────────
section "Verifying Tailscale connectivity"
if [[ -n "$TAILSCALE_URL" ]] && curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$TAILSCALE_URL" 2>/dev/null | grep -q "200"; then
    ok "Tailscale serve verified (HTTPS 200)"
else
    warn "Tailscale serve did not respond. You may need to run inside the sprite:"
    warn "  tailscale serve --bg off && tailscale serve --bg ${DEV_PORT}"
fi


# ── Success: disarm the cleanup trap ─────────────────────────────
CREATED_SPRITE=""
trap - EXIT

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}${BOLD}${SPRITE_NAME}${NC} is ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Tailscale IP:   ${TAILSCALE_IP}"
[[ -n "$TAILSCALE_URL" ]] && \
echo "  Tailscale URL:  ${TAILSCALE_URL}"
echo "  Direct HTTP:    http://${TAILSCALE_IP}:${DEV_PORT}"
echo ""
echo "  Console:        sprite console -s ${SPRITE_NAME}"
echo "  Run command:    sprite exec -s ${SPRITE_NAME} -- <cmd>"
echo "  Destroy:        sprite destroy ${SPRITE_NAME}"
echo ""
echo "  The dev server auto-restarts when the sprite wakes."
echo "  Access is restricted to your tailnet (not public)."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
