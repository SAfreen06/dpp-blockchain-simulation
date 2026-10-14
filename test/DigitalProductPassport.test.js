const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DigitalProductPassport", function () {
  let dpp, creator, other;

  const hash1 = ethers.sha256(ethers.toUtf8Bytes("passport file v1"));
  const hash2 = ethers.sha256(ethers.toUtf8Bytes("passport file v2"));
  const hash3 = ethers.sha256(ethers.toUtf8Bytes("passport file v3"));
  const uri1 = "file:///data/product-001.json";
  const uri2 = "file:///data/product-001-v2.json";
  const uri3 = "file:///data/product-001-v3.json";

  beforeEach(async function () {
    [creator, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DigitalProductPassport");
    dpp = await Factory.deploy();
    await dpp.waitForDeployment();
  });

  it("1. create works", async function () {
    await expect(dpp.connect(creator).createPassport(hash1, uri1))
      .to.emit(dpp, "PassportCreated")
      .withArgs(1, creator.address, hash1, uri1);

    const p = await dpp.getPassport(1);
    expect(p.creator).to.equal(creator.address);
    expect(p.dataHash).to.equal(hash1);
    expect(p.dataURI).to.equal(uri1);
    expect(p.version).to.equal(1n);
  });

  it("2. creator can update", async function () {
    await dpp.connect(creator).createPassport(hash1, uri1);

    await expect(dpp.connect(creator).updatePassport(1, hash2, uri2))
      .to.emit(dpp, "PassportUpdated")
      .withArgs(1, creator.address, hash1, hash2, uri2, 2);

    const p = await dpp.getPassport(1);
    expect(p.dataHash).to.equal(hash2);
    expect(p.dataURI).to.equal(uri2);
  });

  it("3. non-creator update reverts", async function () {
    await dpp.connect(creator).createPassport(hash1, uri1);

    await expect(
      dpp.connect(other).updatePassport(1, hash2, uri2)
    ).to.be.revertedWithCustomError(dpp, "NotCreator")
    .withArgs(1, other.address);

    // state unchanged
    const p = await dpp.getPassport(1);
    expect(p.dataHash).to.equal(hash1);
    expect(p.version).to.equal(1n);
  });

  it("4. version increments by 1 on every update", async function () {
    await dpp.connect(creator).createPassport(hash1, uri1);
    expect((await dpp.getPassport(1)).version).to.equal(1n);

    await dpp.connect(creator).updatePassport(1, hash2, uri2);
    expect((await dpp.getPassport(1)).version).to.equal(2n);

    await dpp.connect(creator).updatePassport(1, hash3, uri3);
    expect((await dpp.getPassport(1)).version).to.equal(3n);
  });
});