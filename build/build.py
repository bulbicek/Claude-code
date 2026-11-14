import sys
src=open('/home/claude/mikrosvet.html').read()
three=open('/tmp/claude-0/three/package/build/three.min.js').read()
src=src.replace("<!--THREEJS-->","<script>"+three+"</script>",1)
head=open('/tmp/claude-0/prefix.html').read()
i=src.index('<div id="app">')
out=head+src[:i]+'</head><body>'+src[i:]
open(sys.argv[1],'w').write(out)
