"""Worker package exports.

Importing the package should not eagerly load the processing worker or trigger
simulation imports, because the runtime service and simulation modules import
this package in opposite directions during startup.
"""

__all__ = ["CameraIngestionWorker", "ProcessingWorker"]


def __getattr__(name):
    if name == "CameraIngestionWorker":
        from .ingestion import CameraIngestionWorker
        return CameraIngestionWorker
    if name == "ProcessingWorker":
        from .processing import ProcessingWorker
        return ProcessingWorker
    raise AttributeError(name)
