import { sql } from "@vercel/postgres";

const COMMANDS = [
    { name: "command1", color: "#ff1744", key: "key_iK2ZWeqhFWCEPyYn" },
    { name: "command2", color: "#ff9100", key: "key_9382dffx1kVZQ2tq" },
    { name: "command3", color: "#ffea00", key: "key_pLIix6MEOLeMa61E" },
    { name: "command4", color: "#00e676", key: "key_ptgUzEjfebzJ6sZW" },
    { name: "command5", color: "#00e5ff", key: "key_NqVwYS81VP7Hb1DX" },
    { name: "command6", color: "#2979ff", key: "key_YK0fFWqcajQLE9WV" },
    { name: "command7", color: "#651fff", key: "key_u8jzPde0IgxLd6Gn" },
    { name: "command8", color: "#d500f9", key: "key_ox9yimTcfipZGnzP" },
    { name: "command9", color: "#1de9b6", key: "key_DNxril3RavGD5Mfv" },
    { name: "command10", color: "#f50057", key: "key_KcBEKanD0F0rPZkc" },
    { name: "command11", color: "#22c55e", key: "key_C3J27XDCG2LmlZGE" },
    { name: "command12", color: "#e11d48", key: "key_ErQHQwjyaxErPZDS" },
    { name: "command13", color: "#0ea5e9", key: "key_qsR6RZ24lPoQj3oP" },
    { name: "command14", color: "#a855f7", key: "key_gNSWPH8prVqsUeQC" },
    { name: "command15", color: "#14b8a6", key: "key_9naHVck6pbd4ZRj2" },
];

async function main() {
    for (const c of COMMANDS) {
        await sql`
      insert into commands (name, color, auth_key)
      values (${c.name}, ${c.color}, ${c.key})
      on conflict (name) do update
      set color = excluded.color,
          auth_key = excluded.auth_key
    `;
    }
    console.log("Seeded commands:", COMMANDS.length);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
