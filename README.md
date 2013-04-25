# node-binary-usenet

A Binary usenet client for nodejs

This package contains:
- 'binary_nntp.js' a NNTP client that uses Buffers for handling lines rather than 'binary' encoded strings.
- 'binary_filegather.js' a utility for grouping multipart binaries together.
- 'ydec.js' a yenc decoder.
- 'sbmh.js' wich is [mscdex/streamsearch](http://github.com/mscdex/streamsearch).

# Secial nodes

- The file 'sbmh.js' is [mscdex/streamsearch](http://github.com/mscdex/streamsearch). All others are my.
- The NNTP implementation contains some code from [mscdex/node-nntp](http://github.com/mscdex/node-nntp).
