const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("url");
const { ethers } = require("hardhat");

const FILE = path.join(__dirname, "..", "data", "product-001.json");

// ---------- helpers ----------
function writeJson(obj) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

function readJson() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

// SHA-256 over the exact bytes of the file (any change, even whitespace, changes the hash)
function hashFile(file) {
  const bytes = fs.readFileSync(file);
  return "0x" + crypto.createHash("sha256").update(bytes).digest("hex");
}

async function verify(dpp, id, label) {
  const localHash = hashFile(FILE);
  const p = await dpp.getPassport(id);
  const ok = localHash === p.dataHash;
  console.log(`\n[VERIFY] ${label}`);
  console.log(`  file hash : ${localHash}`);
  console.log(`  chain hash: ${p.dataHash}  (version ${p.version})`);
  console.log(`  RESULT    : ${ok ? "PASS file matches chain" : "FAIL file does NOT match chain"}`);
  return ok;
}

function section(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

// ---------- main ----------
async function main() {
  const [creator] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("DigitalProductPassport");
  const dpp = await Factory.deploy();
  await dpp.waitForDeployment();
  console.log("Contract deployed at:", await dpp.getAddress());
  console.log("Creator account     :", creator.address);

  const uri = pathToFileURL(FILE).href;

  // 1. Create JSON file, hash it, register it
  section("STEP 1: Create product file and register passport (version 1)");
  writeJson({
    name: "EcoBottle 500",
    serialNumber: "EB-2026-000123",
    manufacturer: "GreenWare Ltd",
    materials: ["recycled PET 80%", "HDPE cap 20%"],
    manufactureDate: "2026-10-01",
    carbonFootprintKgCO2e: 0.42,
  });
  const h1 = hashFile(FILE);
  console.log("File hash:", h1);

  const tx1 = await dpp.createPassport(h1, uri);
  const rc1 = await tx1.wait();
  const created = rc1.logs
    .map((l) => dpp.interface.parseLog(l))
    .find((e) => e && e.name === "PassportCreated");
  assert(created, "PassportCreated event was not found in the transaction receipt");
  const id = created.args.id;
  console.log("Passport id:", id.toString());

  // 2. Edit file, hash again, registered update
  section("STEP 2: Legitimate edit + updatePassport (version 2)");
  const data = readJson();
  data.materials = ["recycled PET 90%", "HDPE cap 10%"];
  data.carbonFootprintKgCO2e = 0.38;
  data.repairHistory = [];
  writeJson(data);
  const h2 = hashFile(FILE);
  console.log("New file hash:", h2);
  await (await dpp.updatePassport(id, h2, uri)).wait();

  // 3. Verify, should pass
  section("STEP 3: Verify after registered update");
  const registeredUpdateMatches = await verify(
    dpp,
    id,
    "after registered update (expect PASS)"
  );
  assert.equal(
    registeredUpdateMatches,
    true,
    "The registered update should match the on-chain hash"
  );

  // 4. Silent edit, verify, should fail
  section("STEP 4: Silent edit (chain NOT updated)");
  const tampered = readJson();
  tampered.materials = ["virgin PET 100%"]; // quietly changed
  writeJson(tampered);
  const silentEditMatches = await verify(
    dpp,
    id,
    "after silent edit (expect FAIL)"
  );
  assert.equal(
    silentEditMatches,
    false,
    "The silent edit should not match the on-chain hash"
  );

  // 5. History from events
  section("STEP 5: Passport history from on-chain events");
  const createdEvents = await dpp.queryFilter(dpp.filters.PassportCreated(id));
  const updatedEvents = await dpp.queryFilter(dpp.filters.PassportUpdated(id));
  const all = [...createdEvents, ...updatedEvents].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.index - b.index
  );

  assert.equal(all.length, 2, "Expected exactly one create and one update event");
  assert.equal(all[0].fragment.name, "PassportCreated");
  assert.equal(all[1].fragment.name, "PassportUpdated");
  assert.equal(all[0].args.dataHash, h1);
  assert.equal(all[1].args.oldHash, h1);
  assert.equal(all[1].args.newHash, h2);
  assert.equal(all[1].args.version, 2n);

  for (const ev of all) {
    if (ev.fragment.name === "PassportCreated") {
      console.log(`\nv1  PassportCreated`);
      console.log(`  block   : ${ev.blockNumber}`);
      console.log(`  tx hash : ${ev.transactionHash}`);
      console.log(`  creator : ${ev.args.creator}`);
      console.log(`  hash    : ${ev.args.dataHash}`);
      console.log(`  uri     : ${ev.args.dataURI}`);
    } else {
      console.log(`\nv${ev.args.version}  PassportUpdated`);
      console.log(`  block   : ${ev.blockNumber}`);
      console.log(`  tx hash : ${ev.transactionHash}`);
      console.log(`  editor  : ${ev.args.editor}`);
      console.log(`  old hash: ${ev.args.oldHash}`);
      console.log(`  new hash: ${ev.args.newHash}`);
      console.log(`  uri     : ${ev.args.newURI}`);
    }
  }

  console.log("\nSimulation completed successfully: expected verification results and history confirmed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
