Function with many arguments

Functions with many arguments indicate either

- low cohesion where the function has too many responsibilities, or
- a missing abstraction that encapsulates those arguments.

Start by investigating the responsibilities of the function. Make sure it doesn't do too many things, in which case it should be split into smaller and more cohesive functions.

Consider the refactoring [Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html) to encapsulate arguments that refer to the same logical concept.