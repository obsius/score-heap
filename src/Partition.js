import { interleaveArrays, searchBinary } from './utility';

/**
 * A fixed length array to handle scores within a dynamic range.
 * Cannot be resized, but can be joined or split.
 */
export default class Partition {

	get max() {
		return this.indices.length ? this.lookups[this.indices[this.length - 1] * 3] : undefined;
	}

	constructor(id, lookups, indices, length) {

		this.id = id;
		this.lookups = lookups;
		this.indices = indices;
		this.length = length;

		this.min = lookups[indices[0] * 3];

		for (let i = 0; i < length; ++i) {

			let index = indices[i] * 3;

			// set id and clear out partition index
			lookups[index + 1] = id;
			lookups[index + 2] = -1;
		}
	}

	insert(index, score, partitionIndex) {
		
		this.lookups[(index * 3) + 1] = this.id;

		partitionIndex = partitionIndex ?? searchBinary(this.length, (i) => {
			return score - this.lookups[this.indices[i] * 3] || index - this.indices[i];
		});

		this.reindex(null, partitionIndex, index);
		++this.length;

		if (partitionIndex == 0) {
			this.min = score;
		}
	}

	join(partition) {
		if (partition.length + this.length <= this.indices.length) {

			let { id, indices, length, lookups } = this;

			let partitionIndices = partition.indices.subarray(0, partition.length);

			for (let i = 0; i < partitionIndices.length; ++i) {
				lookups[(partitionIndices[i] * 3) + 1] = id;
				lookups[(partitionIndices[i] * 3) + 2] = -1;
			}

			this.indices = interleaveArrays(
				new Int32Array(this.indices.length),
				indices.subarray(0, length),
				partitionIndices,
				(a, b) => lookups[partitionIndices[b] * 3] - lookups[indices[a] * 3] || partitionIndices[b] - indices[a]
			);

			this.length += partition.length;

		} else {
			throw new Error('Cannot join with a partition whose additional length overflows the index array');
		}
	}

	next() {
		return this.length ? this.indices[this.length - 1] : undefined;
	}

	remove(index) {

		let { indices, lookups, length } = this;

		let score = lookups[index * 3];

		let partitionIndex = searchBinary(length, (i) => {
			return score - lookups[indices[i] * 3] || index - indices[i];
		});

		// removing from the end does not need a reindex, but before does
		if (partitionIndex < length - 1) {
			this.reindex(partitionIndex, null);
		}

		--this.length;

		lookups[(index * 3) + 1] = -1;

		return index;
	}

	split() {

		let splitIndices = new Int32Array(this.length);
		splitIndices.set(this.indices.subarray(this.length / 2));

		this.length /= 2;

		return splitIndices;
	}


	update(index, score) {

		let { indices, lookups, length } = this;

		let currentScore = lookups[index * 3];

		// nothing to be done if score has not changed
		if (score != currentScore) {

			let currentPartitionIndex = searchBinary(length, (i) => {
				return currentScore - lookups[indices[i] * 3] || index - indices[i];
			});

			// reindex if order has changed
			if (
				(currentPartitionIndex > 0 && score <= lookups[indices[currentPartitionIndex - 1] * 3]) ||
				(currentPartitionIndex < length - 1 && score >= lookups[indices[currentPartitionIndex + 1] * 3])
			) {
				
				let partitionIndex = Math.min(length - 1, searchBinary(length, (i) => {
					return score - lookups[indices[i] * 3] || index - indices[i];
				}));
	
				if (currentPartitionIndex < partitionIndex && partitionIndex > 0 && (score - lookups[indices[partitionIndex] * 3] || index - indices[partitionIndex]) < 0) {
					partitionIndex--;
				}

				if (currentPartitionIndex != partitionIndex) {
					this.reindex(currentPartitionIndex, partitionIndex, index);
				}

				if (partitionIndex == 0) {
					this.min = score;
				} else if (currentPartitionIndex == 0) {
					this.min = this.lookups[this.indices[0] * 3];
				}

			// else just update min score if needed
			} else if (currentPartitionIndex == 0) {
				this.min = score;
			}
		}
	}

	// internal

	reindex(removeIndex, insertIndex, index) {

		// only index if remove / insert are different (also skips if both are null)
		if (removeIndex != insertIndex) {

			let { indices, length } = this;

			// insertion (shift up)
			if (removeIndex == null) {
				indices.set(indices.subarray(insertIndex, length), insertIndex + 1);
				indices[insertIndex] = index;

			// removal (shift down)
			} else if (insertIndex == null) {
				indices.set(indices.subarray(removeIndex + 1, length), removeIndex);

			// removal before insertion (shift down)
			} else if (removeIndex < insertIndex) {
				indices.set(indices.subarray(removeIndex + 1, insertIndex + 1), removeIndex);
				indices[insertIndex] = index;

			// insertion before removal (shift up)
			} else if (removeIndex > insertIndex) {
				indices.set(indices.subarray(insertIndex, removeIndex), insertIndex + 1);
				indices[insertIndex] = index;
			}
		}
	}
}