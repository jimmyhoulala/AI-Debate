import os
import json
import argparse
from collections import defaultdict

try:
    import mysql.connector
except ModuleNotFoundError:
    raise SystemExit("Please install mysql-connector-python: pip install mysql-connector-python")

ROUND_MAP = {
    1: "Opening statement",
    2: "Debate",
    3: "Summary",
}

def export(host, port, user, password, database, out_dir="exports"):
    conn = mysql.connector.connect(
        host=host, port=port, user=user, password=password, database=database
    )
    cur = conn.cursor(dictionary=True)

    cur.execute("SELECT MAX(id) AS max_id FROM topics")
    topic_row = cur.fetchone()
    topic_id = topic_row["max_id"]
    if topic_id is None:
        print("No topics found.")
        conn.close()
        return
    print(f"Exporting topic_id={topic_id}")

    cur.execute("SELECT id, name, order_index FROM agents WHERE topic_id=%s ORDER BY order_index", (topic_id,))
    agents = cur.fetchall()
    agent_map = {a["id"]: a for a in agents}

    cur.execute(
        """SELECT agent_id, round_id, utterance_index, conclusion, references_json
        FROM dialogues
        WHERE topic_id=%s
        ORDER BY round_id, utterance_index""", (topic_id,)
    )
    rows = cur.fetchall()

    speeches = defaultdict(list)
    for row in rows:
        speeches[row["agent_id"]].append(row)

    os.makedirs(out_dir, exist_ok=True)
    for agent_id, utterances in speeches.items():
        agent = agent_map.get(agent_id)
        if not agent:
            continue
        safe_name = "".join(c if c.isalnum() else "_" for c in agent["name"]).strip("_")
        filename = os.path.join(out_dir, f"{agent['order_index']:02d}_{safe_name}_{agent_id}.md")
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"# Agent {agent['name']} (ID {agent_id})\n\n")
            for u in utterances:
                stage = ROUND_MAP.get(u["round_id"], f"Round {u['round_id']}")
                f.write(f"## {stage}\n\n")
                sentence = u["conclusion"] or ""
                f.write(f"- **Utterance {u['utterance_index']}**: {sentence}\n\n")
                refs_json = u["references_json"]
                if refs_json:
                    try:
                        refs = json.loads(refs_json)
                        if refs:
                            f.write("  **References:**\n")
                            for ref in refs:
                                f.write(f"  - {ref}\n")
                            f.write("\n")
                    except json.JSONDecodeError:
                        f.write(f"  **References (raw):** {refs_json}\n\n")
        print(f"Wrote {filename}")

    cur.close()
    conn.close()
    print(f"Exported to '{out_dir}/'.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.getenv("DB_HOST", "localhost"))
    parser.add_argument("--port", type=int, default=int(os.getenv("DB_PORT", 3306)))
    parser.add_argument("--user", default=os.getenv("DB_USER", "root"))
    parser.add_argument("--password", default=os.getenv("DB_PASSWORD", ""))
    parser.add_argument("--database", default=os.getenv("DB_NAME", "ai_debate"))
    parser.add_argument("--out-dir", default="exports")
    args = parser.parse_args()

    export(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        database=args.database,
        out_dir=args.out_dir,
    )

if __name__ == "__main__":
    main()
