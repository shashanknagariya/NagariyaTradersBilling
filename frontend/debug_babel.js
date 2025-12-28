try {
    const plugin = require('nativewind/babel');
    console.log('NativeWind Babel export keys:', Object.keys(plugin));
    if (typeof plugin === 'function') {
        console.log('It is a function');
        console.log('Result of function:', Object.keys(plugin({ types: {} }, {})));
    }
} catch (e) {
    console.error(e);
}
