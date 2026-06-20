# ===========================================================================
#  Shared settings for the Mac scripts. Edit these if you like.
# ===========================================================================

# Leave empty to use the version pinned in server/version.txt (recommended, so
# both of you always run the SAME version). Set e.g. "1.21.4" to force one.
MC_VERSION_OVERRIDE=""

# RAM given to the server. 2G start / 4G max is plenty for two players.
JAVA_XMS="2G"
JAVA_XMX="4G"

SERVER_PORT=25565        # must match server-port in server/server.properties
GIT_BRANCH="main"
BACKUP_KEEP=10           # how many daily .zip snapshots to keep in /backups

# Minimum Java major version. Minecraft 26.x needs Java 25. Newer Java also runs
# older Minecraft fine, so bump this only if a future MC version demands it.
JAVA_MIN=25
