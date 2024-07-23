import { searchBinary } from './utility';

import Partition from './Partition';
import UniformPartition from './UniformPartition';

const MIN_SECTOR_LENGTH =     32;
const TARGET_SECTOR_LENGTH =  1024;
const MAX_SECTOR_LENGTH =     4096;

/**
 * A heap optimized for frequent updates.
 * Maintains a sorted list with partitions so only items within a modified partition need to be reindexed.
 * Returns the highest score (int32) in the heap, else null if the heap is empty.
 */
export default class ScoreHeap {

	partitions = [];
	partitionIds = {};

	nextId = 0;

	/**
	 * @constructs ScoreHeap
	 * 
	 * @param {Array<Array<number, number>>} indexScores - An array of [index, score] to build the heap from (score must be an int32)
	 * @param {number} maxLength - The length of the underlying (unpassed) source array (must never expand beyond this value)
	 */
	constructor(indexScores, maxLength) {

		// holds scores, partition ids, and partition indices (for uniform partitions only)
		// score1, parId1, parI1, score2, ...
		this.lookups = new Int32Array(maxLength * 3);
		this.lookups.fill(-1);

		// compute partition length
		this.partitionLength = Math.min(
			MAX_SECTOR_LENGTH,
			Math.max(
				MIN_SECTOR_LENGTH,
				2 ** Math.floor(Math.log2(indexScores.length / TARGET_SECTOR_LENGTH))
			)
		);

		// sort (input index score format is [[i0Index, i0Score], ...]
		indexScores.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

		// partition
		for (let i = 0; i < indexScores.length;) {

			let chunk = [];

			// fill chunk with indices and update lookup scores
			for (let n = Math.min(indexScores.length, i + this.partitionLength); i < n; ++i) {

				let [index, score] = indexScores[i];

				chunk.push(index);
				this.lookups[index * 3] = score;
			}

			// check if chunk is uniform
			let uniform = chunk.length == this.partitionLength && indexScores[i - 1][1] == indexScores[i - chunk.length][1];

			// uniform chunk: add same scoring indices to the same partition
			if (uniform) {
				while (i < indexScores.length && indexScores[i][1] == indexScores[i - 1][1]) {

					let [index, score] = indexScores[i++];

					chunk.push(index);
					this.lookups[index * 3] = score;
				}
			}

			// update partition id map
			this.partitionIds[this.nextId] = this.partitions.length;

			// add uniform partition (uniform partitions use -1 for removed array elements)
			if (uniform) {
				this.partitions.push(new UniformPartition(this.nextId++, this.lookups, new Int32Array(chunk), chunk.length));

			// else, add partition
			} else {

				let indices = new Int32Array(this.partitionLength);
				indices.set(chunk);

				this.partitions.push(new Partition(this.nextId++, this.lookups, indices, chunk.length));
			}
		}
	}

	/**
	 * Get the highest scoring index.
	 * 
	 * @returns {number} Index with the highest score in the heap
	 */
	next() {
		if (this.partitions.length) {

			let next = this.partitions[this.partitions.length - 1].next();

			// guard loop in if for performance
			if (next == null) {

				this.partitions.pop();

				while (this.partitions.length && (next = this.partitions[this.partitions.length - 1].next()) == null) {
					this.partitions.pop();
				}
			}

			return next;
		}
	}

	/**
	 * Remove an index from the heap.
	 * 
	 * @param {number} index - Index to remove
	 * 
	 * @return {(number|undefined)} The index passed in if successful, else undefined
	 */
	remove(index) {

		if (this.partitions.length) {
			
			let partitionId = this.lookups[(index  * 3) + 1];

			if (partitionId >= 0) {

				let partitionIndex = this.partitionIds[partitionId];

				this.partitions[partitionIndex].remove(index);

				if (!this.partitions[partitionIndex].length) {
					this.partitions.splice(partitionIndex, 1);
					this.reindex(partitionIndex);
				}

				return index;
			}
		}
	}

	/**
	 * Update an index in the heap (index does not have to be in the heap yet).
	 * 
	 * @param {number} index - Index to update (or insert)
	 * @param {number} score - Score of the index (must be an int32)
	 */
	update(index, score) {

		let { lookups, partitions, partitionLength, partitionIds } = this;

		let currentPartitionId = lookups[(index * 3) + 1];
		let currentPartitionIndex = currentPartitionId >= 0 ? partitionIds[currentPartitionId] : undefined;
		let currentPartition = currentPartitionIndex != null ? partitions[currentPartitionIndex] : undefined;

		// check if current partition can handle this internally
		if (currentPartition && (
			currentPartition.uniform ? (
				currentPartition.min == score
			) : (
				partitions.length == 1 || (
					currentPartition.min <= score && (
						currentPartitionIndex == partitions.length - 1 ||
						partitions[currentPartitionIndex + 1].min > score
					)
				)
			)
		)) {

			currentPartition.update(index, score);

			// update lookup score (must be done after update)
			lookups[index * 3] = score;

		// remove / add index
		} else {

			// remove
			if (currentPartition) {

				currentPartition.remove(index);

				if (!currentPartition.length) {

					partitions.splice(currentPartitionIndex, 1);
					this.reindex(currentPartitionIndex);

					// maybe join newly adjacent partitions
					this.joinPartitions(currentPartitionIndex - 1);
				}
			}

			// update lookup score (must be done before insertion)
			lookups[index * 3] = score;

			// no partitions, add to new one
			if (!partitions.length) {

				let partitionIndices = new Int32Array(partitionLength);
				partitionIndices[0] = index;

				this.insertPartition(0, partitionIndices, 1);

			// find new partition and remove / add
			} else {

				// find new partition
				let partitionIndex = searchBinary(partitions.length, (i) => {

					// score is higher or equal to, prefer highest-ordered eligible partition
					if (partitions[i].min <= score) {
						if (i == partitions.length - 1 || partitions[i + 1].min > score) {
							return 0;
						} else {
							return 1;
						}

					// score is lower, but already at first index
					} else if (i == 0) {
						return 0;
					
					// score is lower than partition min
					} else {
						return -1;
					}
				});

				let partition = partitions[partitionIndex];
				let partitionMax = partition.max;

				let lowerPartition = partitionIndex > 0 ? partitions[partitionIndex - 1] : undefined;
				let upperPartition = partitionIndex < partitions.length - 1 ? partitions[partitionIndex + 1] : undefined;

				// TODO : optimize the conditions below

				// best case: uniform partition with matching score
				if (partition.uniform && partition.min == score) {
					partition.insert(index, score);

				// 2: lower partition is uniform with matching score (upper partition can never be uniform and eligible)
				} else if (lowerPartition && lowerPartition.uniform && lowerPartition.min == score) {
					lowerPartition.insert(index, score);

				// 3: partition has room and score is at the end
				} else if (!partition.uniform && partition.length < partitionLength && score > partitionMax) {
					partition.insert(index, score, partition.length);

				// 4: lower partition has room and score at the end
				} else if (false && (lowerPartition && !lowerPartition.uniform && lowerPartition.length < partitionLength && partition.min == score)){
					lowerPartition.insert(index, score, lowerPartition.length);

				// 5: partition is full or non-matching uniform, but upper partition can take the index
				 } else if (
					((partition.uniform || partition.length == partitionLength) && score >= partitionMax) &&
					(upperPartition && !upperPartition.uniform && upperPartition.length < partitionLength)
				) {
					upperPartition.insert(index, score, 0);

				// 6: partition is full or non-matching uniform, but lower partition can take the index
				 } else if (
					((partition.uniform || partition.length == partitionLength) && score == partition.min) && (
						lowerPartition && !lowerPartition.uniform &&
						(lowerPartition.length < partitionLength || (score == lowerPartition.min && lowerPartition.min == lowerPartition.max))
					)
				) {

					// simple insert
					if (lowerPartition.length < partitionLength) {
						lowerPartition.insert(index, score);

					// full, but can be converted to uniform partiion
					} else {
						partitions[partitionIndex - 1] = new UniformPartition(lowerPartition.id, lookups, lowerPartition.indices, lowerPartition.length);
						partitions[partitionIndex - 1].insert(index, score);
					}

				// 7: partition is uniform but ineligible, insert new partition
				} else if (partition.uniform) {

					let partitionIndices = new Int32Array(partitionLength);
					partitionIndices[0] = index;

					this.insertPartition(score > partition.min ? partitionIndex + 1 : partitionIndex, partitionIndices, 1);

				// 8: simple insert (TODO: find best insert case maybe) (TODO: order this before 6?)
				} else if (partition.length < partitionLength) {
					partition.insert(index, score);

				// 9: partition is full but can be converted to uniform partition
				} else if (score == partition.min && partition.min == partitionMax) {
					partitions[partitionIndex] = new UniformPartition(partition.id, lookups, partition.indices, partition.length);
					partitions[partitionIndex].insert(index, score);

				// 10: partition is full, split
				} else {

					let newPartition = this.insertPartition(partitionIndex + 1, partition.split(), partitionLength / 2);

					if (newPartition.min > score) {
						partition.insert(index, score);
					} else {
						newPartition.insert(index, score);
					}
				}
			}
		}
	}

	/* internal */

	// TODO
	audit() {
		/*
		for (let i = 0; i < this.partitions.length - 1; ++i) {
			if (this.partitions[i].max > this.partitions[i + 1].min) {
				console.log(i, this.partitions[i].id, this);
				throw new Error('Misindexed partition in score heap');
			}
		}
		*/
	}

	insertPartition(index, indices, length) {

		let partition = new Partition(this.nextId, this.lookups, indices, length);

		this.partitionIds[this.nextId++] = index;
		this.partitions.splice(index, 0, partition);

		this.reindex(index + 1);

		return partition;
	}

	joinPartitions(index) {
		if (index >= 0 && index < this.partitions.length - 1) {

			let partition1 = this.partitions[index];
			let partition2 = this.partitions[index + 1];

			// join on uniform
			if (partition1.min == partition2.max) {

				// prefer join on lower partition
				if (partition1.uniform) {

					partition1.join(partition2);

					this.partitions.splice(index + 1, 1);
					this.reindex(index + 1);

				// defer to join on upper partition
				} else if (partition2.uniform) {

					partition2.join(partition1);

					this.partitions.splice(index, 1);
					this.reindex(index);

				// neither are uniform, make a new uniform partition
				} else {

					let partitionIndices = new Int32Array(partition1.length + partition2.length);

					partitionIndices.set(partition1.indices.subarray(0, partition1.length));
					partitionIndices.set(partition2.indices.subarray(0, partition2.length), partition1.length);

					this.partitionIds[this.nextId] = index;
					this.partitions.splice(index, 2, new UniformPartition(this.nextId++, this.lookups, partitionIndices, partitionIndices.length));

					this.reindex(index + 1);
				}

			// join partitions if sum length is less than max length
			} else if (!partition1.uniform && !partition2.uniform && partition1.length + partition2.length <= this.partitionLength) {
	
				partition1.join(partition2);

				this.partitions.splice(index + 1, 1);
				this.reindex(index + 0);
			}
		}
	}

	reindex(index) {
		for (let i = index; i < this.partitions.length; ++i) {
			this.partitionIds[this.partitions[i].id] = i;
		}
	}
}