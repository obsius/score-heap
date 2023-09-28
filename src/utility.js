export function searchBinary(length, fn) {

	let minIndex = 0;
	let maxIndex = length - 1;

	let currentIndex;
	let result;

	while (minIndex <= maxIndex) {

		currentIndex = (minIndex + maxIndex) >> 1;

		result = fn(currentIndex);

		if (result > 0) {
			minIndex = currentIndex + 1;
		} else if (result < 0) {
			maxIndex = currentIndex - 1;
		} else {
			break;
		}
	}

	// might not always find the element, so compare and increment if greater than
	if (result > 0) {
		return currentIndex + 1;

	// less than or equal to are treated the same
	} else {
		return currentIndex;
	}
}

export function interleaveArrays(dest, src1, src2, fn) {

	for (let i = 0, j = 0, k = 0, n = src1.length + src2.length; i < n;) {

		while (k < src2.length && (j == src1.length || fn(j, k) < 0)) {
			dest[i++] = src2[k++];
		}

		if (j < src1.length) {
			dest[i++] = src1[j++];
		}
	}

	return dest;
}