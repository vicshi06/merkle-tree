import { mimc7 } from 'circomlib'
import { bigInt } from 'snarkjs'


class MerkleTree {
  /*  Creates an optimized MerkleTree with `treeDepth` depth,
   *  of which are initialized with the initial value `zeroValue`.
   *
   *  i.e. the 0th level is initialized with `zeroValue`,
   *       and the 1st level is initialized with
   *       hashLeftRight(`zeroValue`, `zeroValue`)
   */
  constructor (depth, zeroValue) {
    this.depth = depth
    this.zeroValue = zeroValue
    this.leaves = [] // Hash value of the leaves
    this.leafNumber = Math.pow(2, depth)

    this.zeros = {
      0: zeroValue
    }
    this.filledSubtrees = {
      0: zeroValue
    }
    this.filledPaths = {
      0: {}
    }

    for (let i = 1; i < depth; i++) {
      this.zeros[i] = this.hashLeftRight(this.zeros[i - 1], this.zeros[i - 1])
      this.filledSubtrees[i] = this.zeros[i]
      this.filledPaths[i] = {}
    }

    for (let i = 1; i < depth; i++) {
      for (let j = 0; j < Math.pow(2, depth - i); j++) {
        if (i === 1) {
          this.filledPaths[i][j] = this.hashLeftRight(this.zeroValue, this.zeroValue)
        } else {
          this.filledPaths[i][j] = this.hashLeftRight(this.filledSubtrees[i - 1], this.filledSubtrees[i - 1])
        }
      }
    }

    this.root = this.hashLeftRight(
      this.zeros[this.depth - 1],
      this.zeros[this.depth - 1]
    )

    this.nextIndex = 0
  }

  hash (values) {
    if (Array.isArray(values)) {
      return bigInt(mimc7.multiHash(values.map(x => bigInt(x))))
    }

    return bigInt(mimc7.multiHash([bigInt(values)]))
  }

  /*  Helper function to hash the left and right values
   *  of the leaves
   */
  hashLeftRight (left, right) {
    return this.hash([left, right])
  }

  /* Inserts a new value into the merkle tree */
  insert (leaf) {
    if (this.nextIndex + 1 > this.leafNumber) {
      throw new Error('Merkle Tree at max capacity')
    }

    let curIdx = this.nextIndex
    this.nextIndex += 1

    let currentLevelHash = leaf
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = this.zeros[i]

        this.filledSubtrees[i] = currentLevelHash

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = this.filledSubtrees[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leaves.push(leaf)
  }

  leafExists (
    leafIndex,
    leaf,
    path
  ) {
    if (leafIndex >= this.nextIndex) {
      throw new Error("Can't verify leaf which hasn't been inserted yet!")
    }

    let curIdx = leafIndex
    let currentLevelHash = leaf
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]
      } else {
        left = path[i]
        right = currentLevelHash
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    return this.root === currentLevelHash
  }

  /*  _Verbose_ API to update the value of the leaf in the current tree.
   *  The reason why its so verbose is because I wanted to maintain compatibility
   *  with the merkletree smart contract obtained from semaphore.
   *  (https://github.com/kobigurk/semaphore/blob/2933bce0e41c6d4df82b444b66b4e84793c90893/semaphorejs/contracts/MerkleTreeLib.sol)
   *  It is also very expensive to update if we do it naively on the EVM
   */
  update (
    leafIndex,
    leaf,
    path
  ) {
    if (!this.leafExists(leafIndex, this.leaves[leafIndex], path)) {
      throw new Error('MerkleTree: tree root / current level has mismatch')
    }

    let curIdx = leafIndex
    let currentLevelHash = leaf
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = path[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leaves[leafIndex] = leaf
  }

  /*  Gets the path needed to construct a the tree root
   *  Used for quick verification on updates.
   *  Runs in O(log(N)), where N is the number of leaves
   */
  getPathUpdate (leafIndex) {
    if (leafIndex >= this.nextIndex) {
      throw new Error('Path not constructed yet, leafIndex >= nextIndex')
    }

    let curIdx = leafIndex
    const path = []
    const leafIndexes = []

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        path.push(this.filledPaths[i][curIdx + 1])
        leafIndexes.push([i, curIdx + 1])
      } else {
        path.push(this.filledPaths[i][curIdx - 1])
        leafIndexes.push([i, curIdx - 1])
      }
      curIdx = parseInt(curIdx / 2)
    }

    return [path, leafIndexes]
  }
}



const depth = 3
const zeroValue = bigInt(0)

const merkleTree = new MerkleTree(depth, zeroValue)

merkleTree.insert(bigInt('0x7ff', 16))

for (let i = 1; i <= 7; i++) {
  merkleTree.insert(i)
}

var leafIndex = 1

for (let i = 2; i <= 7; i++) {
  const [path, _] = merkleTree.getPathUpdate(leafIndex)
  merkleTree.update(leafIndex, i, path)
}


var leafIndex = 3
const dataToVerify = bigInt(102934018234802841028) 

const [path, _] = merkleTree.getPathUpdate(leafIndex)
const isValid = merkleTree.leafExists(leafIndex, dataToVerify, path)

console.log(`Data exists: ${isValid}`)
// Data exists: False