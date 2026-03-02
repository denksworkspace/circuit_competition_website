// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
const CRC32_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? ((value >>> 1) ^ 0xedb88320) : (value >>> 1);
    }
    CRC32_TABLE[i] = value >>> 0;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        const idx = (crc ^ buffer[i]) & 0xff;
        crc = (crc >>> 8) ^ CRC32_TABLE[idx];
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(dateRaw = new Date()) {
    const date = dateRaw instanceof Date ? dateRaw : new Date();
    const year = Math.max(1980, date.getUTCFullYear());
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = Math.floor(date.getUTCSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    return { dosDate, dosTime };
}

function sanitizeEntryName(nameRaw) {
    return String(nameRaw || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.\.+/g, "_")
        .replace(/\/+/g, "/")
        .replace(/[\u0000-\u001f]/g, "_")
        .trim();
}

export function buildZipBuffer(entriesRaw) {
    const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
    const uniqueNames = new Set();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const entry of entries) {
        const data = Buffer.isBuffer(entry?.data) ? entry.data : Buffer.from(entry?.data || "");
        const baseName = sanitizeEntryName(entry?.name || "file.bin") || "file.bin";
        let name = baseName;
        let suffix = 1;
        while (uniqueNames.has(name)) {
            const dotIdx = baseName.lastIndexOf(".");
            if (dotIdx <= 0) {
                name = `${baseName}_${suffix}`;
            } else {
                name = `${baseName.slice(0, dotIdx)}_${suffix}${baseName.slice(dotIdx)}`;
            }
            suffix += 1;
        }
        uniqueNames.add(name);

        const nameBuffer = Buffer.from(name, "utf8");
        const { dosDate, dosTime } = toDosDateTime(entry?.date);
        const crc = crc32(data);
        const size = data.length >>> 0;

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(size, 18);
        localHeader.writeUInt32LE(size, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);
        localParts.push(localHeader, nameBuffer, data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(size, 20);
        centralHeader.writeUInt32LE(size, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);
        centralParts.push(centralHeader, nameBuffer);

        localOffset += localHeader.length + nameBuffer.length + data.length;
    }

    const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(entries.length, 8);
    endRecord.writeUInt16LE(entries.length, 10);
    endRecord.writeUInt32LE(centralSize, 12);
    endRecord.writeUInt32LE(localOffset, 16);
    endRecord.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, endRecord]);
}
