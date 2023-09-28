/**
 * An array to handle scores within a fixed range (all scores are equal).
 * Can be resized (doubles each time), but cannot shrink.
 * All removed indices are marked -1 and cleaned up while fetching the next (top) index.
 */
export default class UniformPartition {

	uniform = true;

	get max() {
		return this.min;
	}

	constructor(id, lookups, indices, length) {

		this.id = id;
		this.lookups = lookups;
		this.indices = indices;
		this.length = length;

		this.min = lookups[indices[0] * 3];

		for (let i = 0; i < length; ++i) {

			let index = indices[i] * 3;

			// set id / index
			lookups[index + 1] = this.id;
			lookups[index + 2] = i;
		}
	}

	insert(index) {

		this.lookups[(index * 3) + 1] = this.id;

		// expand the array if full
		if (this.indices.length == this.length) {

			let expandedIndices = new Int32Array(this.length * 2);
			expandedIndices.set(this.indices);

			this.indices = expandedIndices;
		}

		// set lookup reference and add index
		this.lookups[(index * 3) + 2] = this.length;
		this.indices[this.length++] = index;
	}

	join(partition) {

		// expand indices if needed
		if (this.length + partition.length > this.indices.length) {

			let expandedIndices = new Int32Array(this.length + partition.length);
			expandedIndices.set(this.indices);

			this.indices = expandedIndices;
		}

		let { id, indices, length, lookups } = this;

		indices.set(partition.indices.subarray(0, partition.length), length);

		for (let i = length, n = partition.length + length; i < n; ++i) {
			if (indices[i] >= 0) {
				lookups[(indices[i] * 3) + 1] = id;
				lookups[(indices[i] * 3) + 2] = i;
			}
		}

		this.length += partition.length;
	}

	next() {
		if (this.length) {

			// get next available index
			if (this.indices[this.length - 1] < 0) {
				let { indices } = this;
				while (--this.length > 0 && indices[this.length - 1] < 0) {}
			}

			// return next
			if (this.length) {
				return this.indices[this.length - 1];

			// clear out array	
			} else {
				this.indices = new Int32Array(1);
			}
		}
	}

	remove(index) {

		let partitionIndex = this.lookups[(index * 3) + 2];

		// remove from list (array never reorders or shrinks)
		this.indices[partitionIndex] = -1;

		// clear id / partition index
		this.lookups[(index * 3) + 1] = -1;
		this.lookups[(index * 3) + 2] = -1;

		return index;
	}

	// noop
	update() {}
}